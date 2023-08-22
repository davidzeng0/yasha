const Request = require('../Request');

const {Track, TrackImage, TrackResults, TrackPlaylist, TrackStream, TrackStreams} = require('../Track');
const {UnplayableError, NotATrackError} = require('../Error');
const {InternalError, NetworkError, NotFoundError, ParseError} = require('js-common');

class SoundcloudTrack extends Track{
	constructor(){
		super('Soundcloud');
	}

	from(track){
		this.permalink_url = track.permalink_url;

		var streams = new SoundcloudStreams().from(track);

		if(streams.length)
			this.setStreams(streams);
		return this.setOwner(
			track.user.username,
			[{url: track.user.avatar_url, width: 0, height: 0}]
		).setMetadata(
			track.id + '',
			track.title,
			track.duration / 1000,
			TrackImage.from(this.get_thumbnails(track))
		);
	}

	get_thumbnails(track){
		var sizes = [20, 50, 120, 200, 500];
		var visualSizes = [[1240, 260], [2480, 520]];

		var default_thumbnail = track.artwork_url || track.user.avatar_url;
		var multires = /^.*\/(\w+)-([-a-zA-Z0-9]+)-([a-z0-9]+)\.(jpg|png|gif).*$/i.exec(default_thumbnail);

		var thumbnails = [];

		if(multires){
			var type = multires[1];
			var size = multires[3];

			if(type == 'visuals'){
				for(var sz of visualSizes){
					thumbnails.push({
						width: sz[0],
						height: sz[1],
						url: default_thumbnail.replace(size, 't' + sz[0] + 'x' + sz[1])
					});
				}
			}else{
				for(var sz of sizes){
					var rep;

					if(type == 'artworks' && sz == 20)
						rep = 'tiny';
					else
						rep = 't' + sz + 'x' + sz;
					thumbnails.push({
						width: sz,
						height: sz,
						url: default_thumbnail.replace(size, rep)
					});
				}
			}
		}else{
			/* default image */
			thumbnails.push({
				url: default_thumbnail,
				width: 0,
				height: 0
			});
		}

		return thumbnails;
	}

	async fetch(){
		return await api.get(this.id);
	}

	async getStreams(){
		return await api.get_streams(this.id);
	}

	get url(){
		return this.permalink_url;
	}
}

class SoundcloudResults extends TrackResults{
	set_continuation(query, start){
		this.query = query;
		this.start = start;
	}

	async next(){
		return await api.search(this.query, this.start);
	}
}

class SoundcloudPlaylist extends TrackPlaylist{
	platform = 'Soundcloud';
	from(list){
		this.permalink_url = list.permalink_url;
		this.setMetadata(list.title, list.description);

		return this;
	}

	set_continuation(id, start){
		this.id = id;
		this.start = start;
	}

	get url(){
		return this.permalink_url;
	}

	async next(){
		if(this.id)
			return api.playlist_once(this.id, this.start);
		return null;
	}
}

class SoundcloudStream extends TrackStream{
	constructor(url){
		super(null);

		this.stream_url = url;
	}

	async getUrl(){
		var body = await api.request(this.stream_url);

		if(body && body.url)
			return body.url;
		throw new UnplayableError('No stream url found');
	}
}

class SoundcloudStreams extends TrackStreams{
	from(track){
		if(track.media && track.media.transcodings){
			this.set(1, false, Date.now());
			this.extract_streams(track.media.transcodings);
		}

		return this;
	}

	extract_streams(streams){
		for(var stream of streams){
			var [match, container, codecs] = /audio\/([a-zA-Z0-9]{3,4})(?:;(?:\+| )?codecs="(.*?)")?/.exec(stream.format.mime_type);

			if(container == 'mpeg' && !codecs)
				codecs = 'mp3';
			this.push(
				new SoundcloudStream(stream.url)
					.setDuration(stream.duration / 1000)
					.setBitrate(-1)
					.setTracks(false, true)
					.setMetadata(container, codecs)
			);
		}
	}

	expired(){
		return false;
	}

	maybeExpired(){
		return false;
	}
}

var api = new class SoundcloudAPI{
	constructor(){
		this.client_id = 'dbdsA8b6V6Lw7wzu1x0T4CLxt58yd4Bf';
	}

	async request(path, query = {}){
		var res, body, queries = [];

		for(var tries = 0; tries < 2; tries++){
			query.client_id = this.client_id;
			queries = [];

			for(var name in query)
				queries.push(name + '=' + query[name]);
			res = (await Request.getResponse(path + '?' + queries.join('&'))).res;

			if(res.status == 401)
				throw new InternalError('Unauthorized');
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

	async api_request(path, query){
		return await this.request('https://api-v2.soundcloud.com/' + path, query);
	}

	async resolve_playlist(list, offset = 0, limit){
		var unresolved_index = -1;
		var tracks = new SoundcloudPlaylist();

		if(!list || typeof list != 'object' || !(list.tracks instanceof Array))
			throw new InternalError('Invalid list');
		if(offset == 0)
			tracks.from(list);
		if(offset >= list.tracks.length)
			return null;
		try{
			for(var i = offset; i < list.tracks.length; i++){
				if(list.tracks[i].streamable === undefined){
					unresolved_index = i;

					break;
				}

				tracks.push(new SoundcloudTrack().from(list.tracks[i]));
			}
		}catch(e){
			throw new InternalError(e);
		}

		if(!limit || limit + offset > list.tracks.length)
			limit = list.tracks.length;
		else
			limit += offset;
		while(unresolved_index != -1 && unresolved_index < limit){
			var ids = list.tracks.slice(unresolved_index, unresolved_index + 50);
			var body = await this.api_request('tracks', {ids: ids.map(track => track.id).join(',')});

			try{
				if(!body.length)
					break;
				for(var track of body)
					tracks.push(new SoundcloudTrack().from(track));
			}catch(e){
				throw new InternalError(e);
			}

			unresolved_index += body.length;
		}

		tracks.set_continuation(list.id, offset + tracks.length);

		return tracks;
	}

	async resolve(url){
		var body = await this.api_request('resolve', {url: encodeURIComponent(url)});

		if(body.kind == 'track'){
			try{
				return new SoundcloudTrack().from(body);
			}catch(e){
				throw new InternalError(e);
			}
		}else if(body.kind == 'playlist'){
			return this.resolve_playlist(body, 0, 50);
		}else{
			throw new NotATrackError('Unsupported kind: ' + body.kind);
		}
	}

	async resolve_shortlink(id){
		var res, body, location, url;

		url = 'https://on.soundcloud.com/' + encodeURIComponent(id);

		for(var redirects = 0; redirects < 5; redirects++){
			res = (await Request.getResponse(url, {redirect: 'manual'})).res;

			try{
				body = await res.text();
			}catch(e){
				if(!res.ok)
					throw new InternalError(e);
				throw new NetworkError(e);
			}

			if(res.status == 404)
				throw new NotFoundError();
			if(res.status != 302 || !res.headers.has('Location'))
				throw new InternalError(body);
			location = res.headers.get('Location');

			try{
				location = new URL(location, 'https://on.soundcloud.com/');
			}catch(e){
				throw new ParseError('Invalid redirect URL: ' + location);
			}

			url = location.href;

			if(location.hostname == 'soundcloud.com' && location.pathname.startsWith('/') && location.pathname.length > 1)
				return this.resolve(url);
		}

		throw new ParseError('Too many redirects');
	}

	check_valid_id(id){
		if(!/^[\d]+$/.test(id))
			throw new NotFoundError();
	}

	async get(id){
		this.check_valid_id(id);

		var body = await this.api_request('tracks/' + id);

		var track;

		try{
			track = new SoundcloudTrack().from(body);
		}catch(e){
			throw new InternalError(e);
		}

		if(!track.streams)
			throw new UnplayableError('No streams found');
		return track;
	}

	async get_streams(id){
		this.check_valid_id(id);

		var body = await this.api_request('tracks/' + id);

		var streams;

		try{
			streams = new SoundcloudStreams().from(body);
		}catch(e){
			throw new InternalError(e);
		}

		if(!streams.length)
			throw new UnplayableError('No streams found');
		return streams;
	}

	async search(query, offset, limit = 20){
		var body = await this.api_request('search/tracks', {q: encodeURIComponent(query), limit, offset});

		try{
			var results = new SoundcloudResults();

			for(var item of body.collection)
				results.push(new SoundcloudTrack().from(item));
			if(body.collection.length)
				results.set_continuation(query, offset + limit);
			return results;
		}catch(e){
			throw new InternalError(e);
		}
	}

	async playlist_once(id, offset = 0, limit = 50){
		this.check_valid_id(id);

		var body = await this.api_request('playlists/' + id);

		return this.resolve_playlist(body, offset, limit);
	}

	async playlist(id, limit){
		return this.playlist_once(id, 0, limit);
	}
};

module.exports = api;
module.exports.Track = SoundcloudTrack;
module.exports.Results = SoundcloudResults;
module.exports.Playlist = SoundcloudPlaylist;