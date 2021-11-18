const Request = require('../Request');
const SourceError = require('../SourceError');
const Youtube = require('./Youtube');

const {Track, TrackImage, TrackResults, TrackPlaylist} = require('../Track');

class SpotifyTrack extends Track{
	constructor(){
		super('Spotify');
	}

	from(track, artist){
		this.setOwner(track.artists[track.artists.length - 1].name, artist ? TrackImage.from(artist.images) : null);
		this.setMetadata(track.id, track.name, track.duration_ms / 1000, TrackImage.from(track.album.images));

		return this;
	}

	async getStreams(){
		return api.youtube_lookup(this);
	}

	get url(){
		return 'https://open.spotify.com/track/' + this.id;
	}
}

class SpotifyResults extends TrackResults{
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

class SpotifyPlaylist extends TrackPlaylist{
	set_continuation(type, id, start){
		this.type = type;
		this.id = id;
		this.start = start;
	}

	async next(){
		if(this.id != null)
			return await api.list_once(this.type, this.id, this.start);
		return null;
	}

	get url(){
		if(this.type == 'playlists')
			return 'https://open.spotify.com/playlist/' + this.id;
		return 'https://open.spotify.com/album/' + this.id;
	}
}

const api = (new class SpotifyAPI{
	constructor(){
		this.token = null;
		this.reloading = null;

		this.needs_reload = false;
		this.account_data = {};

		this.reload();
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
		var {body} = await Request.getJSON('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {headers: this.account_data});

		if(!body.accessToken)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing access token'));
		this.token = body.accessToken;
	}

	prefetch(){
		if(this.reloading) return this.reloading;
	}

	async api_request(path, options = {}){
		if(!options.headers)
			options.headers = {};
		if(options.body)
			options.body = JSON.stringify(options.body);
		var res, body;

		for(var tries = 0; tries < 2; tries++){
			await this.prefetch();

			options.headers.authorization = 'Bearer ' + this.token;
			res = (await Request.getResponse('https://api.spotify.com/v1/' + path, options)).res;

			if(res.status == 401){
				if(tries)
					throw new SourceError.INTERNAL_ERROR(null, new Error('Unauthorized'));
				this.reload();

				continue;
			}

			break;
		}

		try{
			body = await res.text();
		}catch(e){
			if(!res.ok)
				throw new SourceError.INTERNAL_ERROR(null, e);
			throw new SourceError.NETWORK_ERROR(null, e);
		}

		if(!res.ok)
			throw new SourceError.INTERNAL_ERROR(null, new Error(body));
		try{
			body = JSON.parse(body);
		}catch(e){
			throw new SourceError.INVALID_RESPONSE(null, e);
		}

		return body;
	}

	async youtube_search(track){
		var query = track.author + ' ' + track.title;
		var results = await Youtube.Music.search(query);

		for(var result of results){
			if(results.author == track.author)
				return result;
			if(result.title == track.title)
				return result;
		}

		if(track.duration != -1){
			for(var result of results){
				if(result.duration != -1 && Math.abs(result.duration - track.duration) < 5000)
					return result;
			}
		}

		return result.length ? results[0] : null;
	}

	async youtube_lookup(track){
		var result = await this.youtube_search(track);

		if(result)
			return await result.getStreams();
		throw new SourceError.UNPLAYABLE('Could not find streams for this track');
	}

	async get(id){
		var track = await this.api_request('tracks/' + id);
		var author = track.artists[track.artists.length - 1];

		if(!author)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing artist'));
		var artist = await this.api_request('artists/' + author.id);

		try{
			return new SpotifyTrack().from(track, artist);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async get_streams(id){
		return this.youtube_lookup(await this.get(id));
	}

	async search(query, start = 0, length = 20){
		var data = await this.api_request('search/?type=track&q=' + encodeURIComponent(query) + '&decorate_restrictions=false&include_external=audio&limit=' + length + '&offset=' + start);
		var results = new SpotifyResults();

		if(data.tracks.items.length)
			results.set_continuation(query, start + data.tracks.items.length);
		try{
			for(var result of data.tracks.items)
				results.push(new SpotifyTrack().from(result));
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}

		return results;
	}

	async list_once(type, id, start = 0, length){
		var playlist = new SpotifyPlaylist();
		var images, tracks;

		if(!start){
			var list = await this.api_request(type + '/' + id);

			playlist.setMetadata(list.name, list.description);
			images = list.images;
			tracks = list.tracks;
		}else{
			if(!length)
				length = type == 'playlists' ? 100 : 50;
			tracks = await this.api_request(type + '/' + id + '/tracks?offset=' + start + '&limit=' + length);
		}

		try{
			for(const item of tracks.items){
				if(type == 'playlists' && item.track && !item.track.is_local)
					playlist.push(new SpotifyTrack().from(item.track));
				else if(type == 'albums'){
					item.album = {images};
					playlist.push(new SpotifyTrack().from(item));
				}
			}
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}

		if(tracks.items.length)
			playlist.set_continuation(type, id, start + tracks.items.length);
		return playlist;
	}

	async playlist_once(id, start = 0, length){
		return await this.list_once('playlists', id, start, length);
	}

	async album_once(id, start = 0, length){
		return await this.list_once('albums', id, start, length);
	}

	async list(type, id, limit){
		var list = [];
		var offset = 0;

		do{
			var result = await this.list_once(type, id, offset);

			list = list.concat(result);
			offset = result.start;
		}while(result.id && (!limit || list.length < limit));

		return list;
	}

	async playlist(id, length){
		return this.list('playlists', id, length);
	}

	async album(id, length){
		return this.list('albums', id, length);
	}

	set_cookie(cookie){
		this.account_data.cookie = cookie;
		this.reload(true);
	}
});

module.exports = api;
module.exports.Track = SpotifyTrack;
module.exports.Results = SpotifyResults;
module.exports.Playlist = SpotifyPlaylist;