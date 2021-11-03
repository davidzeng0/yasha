const Request = require('../Request');
const SourceError = require('../SourceError');
const {Track, TrackImage, TrackResults, TrackPlaylist, TrackStream, TrackStreams} = require('../Track');

class SoundcloudTrack extends Track{
	constructor(track, streams){
		super('Soundcloud');

		this.permalink_url = track.permalink_url;

		this.setOwner(
			track.user.username,
			[{url: track.user.avatar_url, width: 0, height: 0}]
		).setMetadata(
			track.id + '',
			track.title,
			track.duration / 1000,
			TrackImage.from(this.get_thumbnails(track))
		).setStreams(streams);
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

	async getStreams(){
		return await api.get_streams(this.id);
	}

	get url(){
		return this.permalink_url;
	}
}

class SoundcloudResults extends TrackResults{
	constructor(query, start){
		super();

		this.query = query;
		this.start = start;
	}

	async next(){
		return await api.search(this.query, this.start);
	}
}

class SoundcloudPlaylist extends TrackPlaylist{
	constructor(list){
		super();

		if(list)
			this.setMetadata(list.title, list.description);
	}

	set_continuation(id, start){
		this.id = id;
		this.start = start;
	}

	async next(){
		if(this.id)
			return api.playlist_once(this.id, this.start);
		return null;
	}
}

class SoundcloudStream extends TrackStream{
	constructor(url){
		super(url);
	}
}

class SoundcloudStreams extends TrackStreams{
	constructor(){
		super(1, false);
	}

	expired(){
		return false;
	}
}

var api = new class SoundcloudAPI{
	constructor(){
		this.client_id = null;

		this.reloading = null;
		this.reload();
	}

	async reload(){
		if(this.reloading)
			return;
		this.reloading = this.load();

		try{
			await this.reloading;
		}catch(e){

		}

		this.reloading = null;
	}

	async prefetch(){
		if(this.reloading) await this.reloading;
	}

	async load(){
		var {body} = await Request.get('https://soundcloud.com');
		var regex = /<script crossorigin src="(.*?)"><\/script>/g;
		var result;

		while(result = regex.exec(body)){
			var script = (await Request.get(result[1])).body;
			var id = /client_id:"([\w\d_-]+?)"/i.exec(script);

			if(id && id[1]){
				this.client_id = id[1];

				return;
			}
		}

		throw new SourceError.INTERNAL_ERROR(null, new Error('Could not find client id'));
	}

	async request(path, query = {}){
		var res, body, queries = [];

		for(var tries = 0; tries < 2; tries++){
			await this.prefetch();

			query.client_id = this.client_id;
			queries = [];

			for(var name in query)
				queries.push(name + '=' + query[name]);
			res = (await Request.getResponse(path + '?' + queries.join('&'))).res;

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

		if(res.status == 404)
			throw new SourceError.NOT_FOUND('Not found');
		if(!res.ok)
			throw new SourceError.INTERNAL_ERROR(null, new Error(body));
		try{
			body = JSON.parse(body);
		}catch(e){
			throw new SourceError.INVALID_RESPONSE(null, e);
		}

		return body;
	}

	async api_request(path, query){
		return await this.request('https://api-v2.soundcloud.com/' + path, query);
	}

	async resolve_playlist(list, offset = 0, limit){
		var unresolved_index = -1;
		var tracks = new SoundcloudPlaylist(offset == 0 ? list : null);

		for(var i = offset; i < list.tracks.length; i++){
			if(list.tracks[i].streamable === undefined){
				unresolved_index = i;

				break;
			}

			try{
				tracks.push(new SoundcloudTrack(list.tracks[i]));
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}
		}

		if(!limit || limit + offset > list.tracks.length)
			limit = list.tracks.length;
		else
			limit += offset;
		while(unresolved_index != -1 && unresolved_index < limit){
			var ids = list.tracks.slice(unresolved_index, unresolved_index + 50);
			var body = await this.api_request('tracks', {ids: ids.map(track => track.id).join(',')});

			if(!body.length)
				break;
			try{
				for(var track of body)
					tracks.push(new SoundcloudTrack(track));
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
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
				var streams = await this.resolve_streams(body);

				return new SoundcloudTrack(body, streams);
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}
		}else if(body.kind == 'playlist'){
			return this.resolve_playlist(body, 0, 50);
		}else{
			throw new SourceError.INTERNAL_ERROR(null, new Error('Unknown kind ' + body.kind));
		}
	}

	async resolve_streams(track){
		var streams = new SoundcloudStreams();

		if(!track.media || !track.media.transcodings)
			throw new SourceError.UNPLAYABLE('No streams found');
		var requests = [];

		for(var stream of track.media.transcodings)
			requests.push(this.request(stream.url));
		requests = await Promise.all(requests);

		for(var i = 0; i < track.media.transcodings.length; i++){
			var stream = track.media.transcodings[i],
				data = requests[i];
			var [match, container, codecs] = /audio\/([a-zA-Z0-9]{3,4})(?:;(?:\+| )?codecs="(.*?)")?/.exec(stream.format.mime_type);

			if(container == 'mpeg' && !codecs)
				codecs = 'mp3';
			streams.push(
				new SoundcloudStream(data.url)
					.setDuration(stream.duration / 1000)
					.setBitrate(-1)
					.setTracks(false, true)
					.setMetadata(container, codecs)
			);
		}

		return streams;
	}

	async get(id){
		var body = await this.api_request('tracks/' + id);

		var result, streams;

		try{
			streams = await this.resolve_streams(body);
			result = new SoundcloudTrack(body, streams);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}

		return result;
	}

	async get_streams(id){
		var body = await this.api_request('tracks/' + id);

		try{
			return this.resolve_streams(body);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async search(query, offset, limit = 20){
		var body = await this.api_request('search/tracks', {q: encodeURIComponent(query), limit, offset});

		try{
			var results = new SoundcloudResults(query, offset + limit);

			for(var item of body.collection)
				results.push(new SoundcloudTrack(item));
			return results;
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async playlist_once(id, offset = 0, limit = 50){
		var body = await this.api_request('playlists/' + id);

		return this.resolve_playlist(body, offset, limit);
	}

	async playlist(id, limit){
		var body = await this.api_request('playlists/' + id);

		return this.resolve_playlist(body, 0, limit);
	}
};

module.exports = api;