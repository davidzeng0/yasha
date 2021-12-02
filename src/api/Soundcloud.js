const Request = require('../Request');
const SourceError = require('../SourceError');
const util = require('./util');

const {Track, TrackImage, TrackResults, TrackPlaylist, TrackStream, TrackStreams} = require('../Track');

class SoundcloudTrack extends Track{
	constructor(){
		super('Soundcloud');
	}

	from(track, streams){
		this.permalink_url = track.permalink_url;

		return this.setOwner(
			track.user.username,
			[{url: track.user.avatar_url, width: 0, height: 0}]
		).setMetadata(
			track.id + '',
			track.title,
			track.duration / 1000,
			TrackImage.from(this.get_thumbnails(track))
		).setStreams(this.from_streams(track));
	}

	from_streams(track){
		var streams = new SoundcloudStreams();

		if(!track.media || !track.media.transcodings)
			throw new SourceError.UNPLAYABLE('No streams found');
		for(var stream of track.media.transcodings){
			var [match, container, codecs] = /audio\/([a-zA-Z0-9]{3,4})(?:;(?:\+| )?codecs="(.*?)")?/.exec(stream.format.mime_type);

			if(container == 'mpeg' && !codecs)
				codecs = 'mp3';
			streams.push(
				new SoundcloudStream(stream.url)
					.setDuration(stream.duration / 1000)
					.setBitrate(-1)
					.setTracks(false, true)
					.setMetadata(container, codecs)
			);
		}

		return streams;
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
	set_continuation(query, start){
		this.query = query;
		this.start = start;
	}

	async next(){
		return await api.search(this.query, this.start);
	}
}

class SoundcloudPlaylist extends TrackPlaylist{
	from(list){
		if(list){
			this.permalink_url = list.permalink_url;
			this.setMetadata(list.title, list.description);
		}

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
		return (await api.request(this.stream_url)).url;
	}
}

class SoundcloudStreams extends TrackStreams{
	constructor(){
		super(1, false, Date.now());
	}

	expired(){
		return false;
	}

	maybe_expired(){
		return Date.now() - this.time > 5 * 60 * 1000;
	}
}

var api = new class SoundcloudAPI{
	constructor(){
		this.client_id = null;
		this.reloading = null;
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
		if(!this.client_id)
			this.reload();
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
				this.client_id = util.deepclone(id[1]);

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
		var tracks = new SoundcloudPlaylist().from(offset == 0 ? list : null);

		if(offset >= list.tracks.length)
			return null;
		for(var i = offset; i < list.tracks.length; i++){
			if(list.tracks[i].streamable === undefined){
				unresolved_index = i;

				break;
			}

			try{
				tracks.push(new SoundcloudTrack().from(list.tracks[i]));
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
					tracks.push(new SoundcloudTrack().from(track));
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
				return new SoundcloudTrack().from(body, streams);
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}
		}else if(body.kind == 'playlist'){
			return this.resolve_playlist(body, 0, 50);
		}else{
			throw new SourceError.NOT_A_TRACK(null, new Error('Unsupported kind: ' + body.kind));
		}
	}

	async get(id){
		var body = await this.api_request('tracks/' + id);

		var result, streams;

		try{
			result = new SoundcloudTrack().from(body);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}

		return result;
	}

	async get_streams(id){
		var body = await this.api_request('tracks/' + id);

		try{
			return new SoundcloudTrack().from_streams(body);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
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
module.exports.Track = SoundcloudTrack;
module.exports.Results = SoundcloudResults;
module.exports.Playlist = SoundcloudPlaylist;