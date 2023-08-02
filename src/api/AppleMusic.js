const Request = require('../Request');
const Youtube = require('./Youtube');

const {Track, TrackImage, TrackResults, TrackPlaylist} = require('../Track');
const {InternalError, NetworkError, NotFoundError, ParseError} = require('js-common');

class AppleMusicTrack extends Track{
	constructor(){
		super('AppleMusic');
	}

	gen_image(url, artist){
		var dim = artist ? 220 : 486;

		return [new TrackImage(url.replaceAll('{w}', dim).replaceAll('{h}', dim).replaceAll('{c}', artist ? 'sr' : 'bb').replaceAll('{f}', 'webp'), dim, dim)];
	}

	from(track){
		var icon;

		for(var artist of track.relationships.artists.data)
			if(artist.attributes.artwork)
				icon = this.gen_image(artist.attributes.artwork.url, true);
		this.artists = track.relationships.artists.data.map(artist => artist.attributes.name);
		this.setOwner(this.artists.join(', '), icon);
		this.setMetadata(track.id, track.attributes.name, track.attributes.durationInMillis / 1000, this.gen_image(track.attributes.artwork.url));

		this.explicit = track.attributes.contentRating == 'explicit';

		return this;
	}

	async fetch(){
		return api.get(this.id);
	}

	async getStreams(){
		return Youtube.track_match(this);
	}

	get url(){
		return 'https://music.apple.com/song/' + this.id;
	}
}

class AppleMusicResults extends TrackResults{
	set_continuation(query, start){
		this.query = query;
		this.start = start;
	}

	async next(){
		if(this.query != null)
			return await api.search(this.query, this.start);
		return null;
	}
}

class AppleMusicPlaylist extends TrackPlaylist{
	set(type, id){
		this.type = type;
		this.id = id;
	}

	set_continuation(start){
		this.start = start;
	}

	async next(){
		if(this.start !== undefined)
			return await api.list_once(this.type, this.id, this.start);
		return null;
	}

	get url(){
		if(this.type == 'playlists')
			return 'https://music.apple.com/playlist/' + this.id;
		return 'https://music.apple.com/album/' + this.id;
	}
}

const api = (new class AppleMusicAPI{
	constructor(){
		this.token = null;
		this.reloading = null;
		this.needs_reload = false;
	}

	async reload(force){
		if(this.reloading){
			if(force)
				this.needs_reload = true;
			return;
		}

		do{
			this.needs_reload = false;
			this.reloading = this.load();

			try{
				await this.reloading;
			}catch(e){

			}

			this.reloading = null;
		}while(this.needs_reload);
	}

	async load(){
		var {body} = await Request.get('https://music.apple.com/us/browse');
		var config = /<meta name="desktop-music-app\/config\/environment" content="(.*?)">/.exec(body);

		if(!config)
			throw new InternalError('Missing config');
		try{
			config = JSON.parse(decodeURIComponent(config[1]));
		}catch(e){
			throw new InternalError(e);
		}

		if(!config?.MEDIA_API?.token)
			throw new InternalError('Missing token');
		this.token = config.MEDIA_API.token;
	}

	prefetch(){
		if(!this.token)
			this.reload();
		if(this.reloading)
			return this.reloading;
	}

	async api_request(path, query = {}, options = {}){
		var res, body, queries = [];

		for(var name in query)
			queries.push(encodeURIComponent(name) + '=' + encodeURIComponent(query[name]));
		if(queries.length)
			queries = '?' + queries.join('&');
		else
			queries = '';
		if(!options.headers)
			options.headers = {};
		for(var tries = 0; tries < 2; tries++){
			await this.prefetch();

			options.headers.authorization = `Bearer ${this.token}`;
			options.headers.origin = 'https://music.apple.com';
			res = (await Request.getResponse(`https://amp-api.music.apple.com/v1/catalog/us/${path}${queries}`, options)).res;

			if(res.status == 401){
				if(tries)
					throw new InternalError('Unauthorized');
				this.reload();

				continue;
			}

			break;
		}

		try{
			body = await res.text();
		}catch(e){
			if(!res.ok)
				throw new InternalError(e);
			throw new NetworkError(e);
		}

		if(res.status == 404)
			throw new NotFoundError();
		if(!res.ok)
			throw new InternalError(body);
		try{
			body = JSON.parse(body);
		}catch(e){
			throw new ParseError(e);
		}

		return body;
	}

	check_valid_id(id){
		if(!/^[\d]+$/.test(id))
			throw new NotFoundError();
	}

	async get(id){
		this.check_valid_id(id);

		var track = await this.api_request('songs/' + id, {
			'fields[artists]': 'url,name,artwork,hero',
			'include[songs]': 'artists',
			'extend': 'artistUrl',
			'art[url]': 'c,f',
		});

		try{
			return new AppleMusicTrack().from(track.data[0]);
		}catch(e){
			throw new InternalError(e);
		}
	}

	async get_streams(id){
		return Youtube.track_match(await this.get(id));
	}

	get_next(url, param){
		var num;

		url = new URL(url, 'https://amp-api.music.apple.com');
		num = parseInt(url.searchParams.get(param));

		if(!Number.isFinite(num))
			throw new InternalError('Invalid next');
		return num;
	}

	async search(query, offset = 0, limit = 25){
		var data = await this.api_request('search', {
			groups: 'song',
			offset,
			limit,
			l: 'en-US',
			term: query,
			platform: 'web',
			types: 'activities,albums,apple-curators,artists,curators,editorial-items,music-movies,music-videos,playlists,songs,stations,tv-episodes,uploaded-videos,record-labels',
			'include[songs]': 'artists',
			'relate[editorial-items]': 'contents',
			'include[editorial-items]': 'contents',
			'include[albums]': 'artists',
			'extend': 'artistUrl',
			'fields[artists]': 'url,name,artwork,hero',
			'fields[albums]': 'artistName,artistUrl,artwork,contentRating,editorialArtwork,name,playParams,releaseDate,url',
			'with': 'serverBubbles,lyricHighlights',
			'art[url]': 'c,f',
			'omit[resource]': 'autos'
		});

		var results = new AppleMusicResults();
		var song = data.results.song;

		if(!song)
			return results;
		try{
			if(song.next)
				results.set_continuation(query, this.get_next(song.next, 'offset'));
			for(var result of song.data)
				results.push(new AppleMusicTrack().from(result));
		}catch(e){
			throw new InternalError(e);
		}

		return results;
	}

	async list_once(type, id, offset = 0, limit = 100){
		this.check_valid_playlist_id(id);

		var result = new AppleMusicPlaylist();
		var playlist;

		if(!offset){
			playlist = await this. api_request(`${type}/${id}`, {
				l: 'en-us',
				platform: 'web',
				views: 'featured-artists,contributors',
				extend: 'artistUrl,trackCount,editorialVideo,editorialArtwork',
				include: 'tracks',
				'include[playlists]': 'curator',
				'include[songs]': 'artists',
				'fields[artists]': 'name,url,artwork',
				'art[url]': 'c,f'
			});

			playlist = playlist.data[0];
		}else{
			playlist = await this.api_request(`${type}/${id}/tracks`, {
				l: 'en-us',
				platform: 'web',
				offset,
				limit,
				'include[songs]': 'artists',
				'fields[artists]': 'name,url',
				'fields[artists]': 'name,url,artwork',
			});
		}

		result.set(type, id);

		try{
			if(!offset){
				result.setMetadata(playlist.attributes.name, playlist.attributes.description?.standard);
				id = playlist.id;
				playlist = playlist.relationships.tracks;
			}

			for(var item of playlist.data)
				result.push(new AppleMusicTrack().from(item));
			if(playlist.next)
				result.set_continuation(this.get_next(playlist.next, 'offset'));
		}catch(e){
			throw new InternalError(e);
		}

		return result;
	}

	check_valid_playlist_id(id){
		if(!/^[\w\.-]+$/.test(id))
			throw new NotFoundError();
	}

	async playlist_once(id, offset, length){
		return await this.list_once('playlists', id, offset, length);
	}

	async album_once(id, offset, length){
		return await this.list_once('albums', id, offset, length);
	}

	async list(type, id, limit){
		var list = null;
		var offset = 0;

		do{
			var result = await this.list_once(type, id, offset);

			if(!list)
				list = result;
			else
				list = list.concat(result);
			offset = result.start;
		}while(offset !== undefined && (!limit || list.length < limit));

		return list;
	}

	async playlist(id, length){
		return this.list('playlists', id, length);
	}

	async album(id, length){
		return this.list('albums', id, length);
	}
});

module.exports = api;
module.exports.Track = AppleMusicTrack;
module.exports.Results = AppleMusicResults;
module.exports.Playlist = AppleMusicPlaylist;