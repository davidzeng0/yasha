const Request = require('../Request');
const SourceError = require('../SourceError');
const Youtube = require('./Youtube');
const {Track, TrackImage, TrackResults, TrackPlaylist} = require('../Track');

const spotifyInterface = (new class{
	constructor(){
		this.token = null;
		this.data = null;

		this.needs_reload = false;
		this.account_data = {};

		this.reload();
	}

	async do(){
		var {body} = await Request.getJSON('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {headers: this.account_data});

		if(!body.accessToken)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing access token'));
		this.token = body.accessToken;
	}

	fetch(){
		if(this.data)
			return this.data;
	}

	async reload(force = true){
		if(this.data){
			if(force)
				this.needs_reload = true;
			return;
		}

		do{
			this.needs_reload = false;
			this.data = this.do();

			try{
				await this.data;
			}catch(e){

			}

			this.data = null;
		}while(this.needs_reload);
	}

	async makeRequest(path, options = {}){
		await this.fetch();

		if(!options.headers)
			options.headers = {};
		if(options.body)
			options.body = JSON.stringify(options.body);
		var res, body;

		for(var tries = 0; tries < 2; tries++){
			options.headers.authorization = 'Bearer ' + this.token;
			res = (await Request.getResponse(path, options)).res;

			if(res.status == 401){
				if(tries)
					throw new SourceError.INTERNAL_ERROR(null, new Error('Unauthorized'));
				this.reload();

				await this.fetch();
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

	async makeApiRequest(path, options){
		return await this.makeRequest('https://api.spotify.com/v1/' + path, options);
	}

	setCookie(cookie){
		this.account_data.cookie = cookie;
		this.reload();
	}
});

class SpotifyTrack extends Track{
	constructor(track, artist){
		super('Spotify');

		var author = track.artists.length ? track.artists[track.artists.length - 1] : {name: ''};

		this.setOwner(author.name, artist ? TrackImage.from(artist.images) : null);
		this.setMetadata(track.id, track.name, track.duration_ms / 1000, TrackImage.from(track.album.images));

	}

	async getStreams(){
		return youtube_lookup(this);
	}

	get url(){
		return 'https://open.spotify.com/track/' + this.id;
	}
}

class SpotifyResults extends TrackResults{
	constructor(query, start){
		super();

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
	constructor(type, id, start){
		super();

		this.type = type;
		this.id = id;
		this.start = start;
	}

	async next(){
		if(this.id != null)
			return await api.listOnce(this.type, this.id, this.start);
		return null;
	}
}

async function youtube_search(track){
	var query = track.owner_name + ' - ' + track.title;
	var results = await Youtube.search(query);

	var author_match = [track.owner_name, track.owner_name + ' - Topic'];

	for(var result of results){
		for(var author of author_match)
			if(results.owner_name == author)
				return result;
		if(result.title == track.title)
			return result;
	}

	if(track.duration){
		for(var result of results){
			if(result.duration && Math.abs(result.duration - track.duration) < 5000)
				return result;
		}
	}

	return result.length ? results[0] : null;
}

async function youtube_lookup(track){
	var result = await youtube_search(track);

	if(result){
		result = await result.getStreams();

		return result;
	}

	throw new SourceError.NOT_FOUND('Youtube stream lookup returned no results', new Error('Could not find streams for this track'));
}

const api = new (class{
	constructor(){}

	async get(id){
		var track = await spotifyInterface.makeApiRequest('tracks/' + id);
		var author = track.artists[track.artists.length - 1];
		var artist = await spotifyInterface.makeApiRequest('artists/' + author.id);

		return new SpotifyTrack(track, artist);
	}

	async getStreams(id){
		var track = await this.get(id);

		return track.getStreams();
	}

	async search(query, start = 0){
		var data = await spotifyInterface.makeApiRequest('search/?type=track&q=' + encodeURIComponent(query) + '&decorate_restrictions=false&include_external=audio&limit=20&offset=' + start);

		var results = new SpotifyResults(data.tracks.items.length ? query : null, start + data.tracks.items.length);

		for(var result of data.tracks.items)
			results.push(new SpotifyTrack(result));
		return results;
	}

	async listOnce(type, id, start = 0){
		/* TODO try catch wrap */
		var playlist = new SpotifyPlaylist(type, id);
		var album_images;

		if(!start){
			var {description, name, images} = await spotifyInterface.makeApiRequest(type + '/' + id);

			playlist.setMetadata(name, description);
			album_images = images;
		}

		var tracks = await spotifyInterface.makeApiRequest(type + '/' + id + '/tracks?offset=' + start + '&limit=' + (type == 'playlists' ? 100 : 50));

		for(const item of tracks.items){
			if(type == 'playlists' && item.track && !item.track.is_local)
				playlist.push(new SpotifyTrack(item.track));
			else if(type == 'albums'){
				item.album = {images: album_images};
				playlist.push(new SpotifyTrack(item));
			}
		}

		if(tracks.items.length >= 100)
			playlist.start = start + tracks.items.length;
		else
			playlist.id = null;
		return playlist;
	}

	async playlistOnce(id, start = 0){
		return await this.listOnce('playlists', id, start);
	}

	async albumOnce(id, start = 0){
		return await this.listOnce('albums', id, start);
	}
});

module.exports = api;