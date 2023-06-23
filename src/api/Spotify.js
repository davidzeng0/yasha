const Request = require('../Request');
const SourceError = require('../SourceError');
const Youtube = require('./Youtube');

const {Track, TrackImage, TrackResults, TrackPlaylist} = require('../Track');

class SpotifyTrack extends Track{
	constructor(){
		super('Spotify');
	}

	from(track, artist){
		this.artists = track.artists.map(artist => artist.name);
		this.setOwner(this.artists.join(', '), artist ? TrackImage.from(artist.images) : null);
		this.setMetadata(track.id, track.name, track.duration_ms / 1000, TrackImage.from(track.album.images));
		this.explicit = track.explicit;

		return this;
	}

	async fetch(){
		return api.get(this.id);
	}

	async getStreams(){
		return Youtube.track_match(this);
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
		const {body} = await Request.getJSON('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {headers: this.account_data});

		if(!body.accessToken)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing access token'));
		this.token = body.accessToken;
	}

	prefetch(){
		if(!this.token)
			this.reload();
		if(this.reloading)
			return this.reloading;
	}

	async api_request(path, options = {}){
		if(!options.headers)
			options.headers = {};
		if(options.body)
			options.body = JSON.stringify(options.body);
		let res, body;

		for(let tries = 0; tries < 2; tries++){
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

	check_valid_id(id){
		if(!/^[\w]+$/.test(id))
			throw new SourceError.NOT_FOUND();
	}

	async get(id){
		this.check_valid_id(id);

		const track = await this.api_request('tracks/' + id);
		const author = track.artists[track.artists.length - 1];

		if(!author)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing artist'));
		const artist = await this.api_request('artists/' + author.id);

		try{
			return new SpotifyTrack().from(track, artist);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async get_streams(id){
		return Youtube.track_match(await this.get(id));
	}

	async search(query, start = 0, length = 20){
		const data = await this.api_request('search/?type=track&q=' + encodeURIComponent(query) + '&decorate_restrictions=false&include_external=audio&limit=' + length + '&offset=' + start);
		const results = new SpotifyResults();

		if(data.tracks.items.length)
			results.set_continuation(query, start + data.tracks.items.length);
		try{
			for(const result of data.tracks.items)
				results.push(new SpotifyTrack().from(result));
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}

		return results;
	}

	async list_once(type, id, start = 0, length){
		this.check_valid_id(id);

		const playlist = new SpotifyPlaylist();
		let images, tracks;

		if(!start){
			const list = await this.api_request(type + '/' + id);

			playlist.setMetadata(list.name, list.description);
			images = list.images;
			tracks = list.tracks;
		}else{
			if(!length)
				length = type == 'playlists' ? 100 : 50;
			tracks = await this.api_request(type + '/' + id + '/tracks?offset=' + start + '&limit=' + length);
		}

		playlist.set(type, id);

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
			playlist.set_continuation(start + tracks.items.length);
		return playlist;
	}

	async playlist_once(id, start = 0, length){
		return await this.list_once('playlists', id, start, length);
	}

	async album_once(id, start = 0, length){
		return await this.list_once('albums', id, start, length);
	}

	async list(type, id, limit){
		let list = null;
		let offset = 0;

		do{
			const result = await this.list_once(type, id, offset);

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

	set_cookie(cookie){
		this.account_data.cookie = cookie;
		this.reload(true);
	}
});

module.exports = api;
module.exports.Track = SpotifyTrack;
module.exports.Results = SpotifyResults;
module.exports.Playlist = SpotifyPlaylist;