const Request = require('../Request');
const SourceError = require('../SourceError');
const {Track, TrackImage, TrackResults, TrackPlaylist, TrackStream, TrackStreams} = require('../Track');

const soundcloudInterface = (new class{
	constructor(){
		this.clientId = null;

		this.data = null;

		this.reload();
	}

	async reload(){
		if(this.data)
			return;
		for(var i = 0; i < 2; i++){
			this.data = this.do();

			try{
				await this.data;
			}catch(e){
				throw new SourceError.INTERNAL_ERROR('Could not load client id', e);

				if(!e.fatal)
					continue;
			}

			break;
		}

		this.data = null;
	}

	async fetch(){
		if(this.data)
			await this.data;
	}

	async do(){
		var {res, body} = await Request.get('https://soundcloud.com');
		var regex = /<script crossorigin src="(.*?)"><\/script>/g;
		var result;

		while(result = regex.exec(body)){
			var script = (await Request.get(result[1])).body;
			var id = /client_id:"([a-z0-9_-]+?)"/i.exec(script);

			if(id && id[1]){
				this.clientId = id[1];

				return;
			}
		}

		throw new SourceError.INTERNAL_ERROR(null, new Error('Could not find client id'));
	}

	async abspathRequest(path, query = {}){
		query.client_id = this.clientId;

		var queries = [];

		for(var name in query)
			queries.push(name + '=' + query[name]);
		return await Request.getJSON(path + '?' + queries.join('&'));
	}

	async makeRequest(path, query){
		return await this.abspathRequest('https://api-v2.soundcloud.com/' + path, query);
	}
});

class SoundcloudTrack extends Track{
	constructor(track){
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
				for(var sz of visualSizes)
					thumbnails.push({
						width: sz[0],
						height: sz[1],
						url: default_thumbnail.replace(size, 't' + sz[0] + 'x' + sz[1])
					});
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

	async load_streams(track){
		this.setStreams(new SoundcloudStreams());

		if(track.media && track.media.transcodings){
			for(var stream of track.media.transcodings){
				// if(stream.format.protocol == 'progressive'){
				// 	const {resp, body} = await soundcloudInterface.abspathRequest(stream.url);

				// 	result.streams = [{url: body.url}];

				// 	break;
				// }

				if(stream.format.protocol == 'hls'){
					var mime = /(audio)\/([a-zA-Z0-9]{3,4})(?:;(?:\+| )?codecs="(.*?)")?/.exec(stream.format.mime_type);
					var data = await soundcloudInterface.abspathRequest(stream.url);

					// var data = await APIUtil.get(url);

					// const parser = new Parser();

					// parser.push(data);
					// parser.end();

					// var dash = true;

					// for(const segment of parser.segments)
					// 	if(!/https:\/\/[^]+?\/media\/[0-9]+?\/[0-9]+?\/[^]/.exec(segment.uri)){
					// 		dash = false;

					// 		break;
					// 	}

					this.streams.push(
						new SoundcloudStream(data.body.url)
							.setDuration(stream.duration / 1000)
							.setBitrate(-1)
							.setTracks(false, true)
							.setMetadata(mime[2], mime[3])
					);
				}
			}
		}
	}

	async getStreams(){
		return await api.get(this.id);
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
	async next(){

	}
}

class SoundcloudStream extends TrackStream{
	constructor(url){
		super(url);
	}
}

class SoundcloudStreams extends TrackStreams{
	constructor(){
		super(false);
	}

	expired(){
		return false;
	}
}

var api = new (class{
	// _fetchTracks(tracks, callback){
	// 	var tr = [];

	// 	for(var i = 0; i < tracks.length; i++)
	// 		tr.push(tracks[i].id);
	// 	request({method: 'GET', url: 'https://api-v2.soundcloud.com/tracks?ids=' + tr.join(encodeURIComponent(',')) + '&client_id=' + this.clientId}, (err, resp, body) => {
	// 		if(err)
	// 			callback(err, null);
	// 		if(resp.statusCode < 200 || resp.statusCode >= 400)
	// 			return callback(new Error('Error ' + resp.statusCode), null);
	// 		var data = JSON.parse(body);

	// 		for(var i = 0; i < data.length; i++)
	// 			data[i] = this._makeResultFromTrack(data[i]);
	// 		callback(null, data);
	// 	});
	// }

	async resolve(url){
		var {res, body} = await soundcloudInterface.makeRequest('resolve', {url: encodeURIComponent(url)});

		try{
			if(body.kind == 'track'){
				var result = new SoundcloudTrack(body);

				await result.load_streams(body);

				return result;
			}
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}

		throw new SourceError.INTERNAL_ERROR(null, new Error(body.kind + ' not supported'));
	}

	// get(url, callback){
	// 	request({method: 'GET', url: 'https://api-v2.soundcloud.com/resolve?url=' + encodeURIComponent(url) + '&client_id=' + this.clientId}, (err, resp, body) => {
	// 		if(err)
	// 			return callback(err, null);
	// 		if(resp.statusCode < 200 || resp.statusCode >= 400)
	// 			return callback(new Error('Error ' + resp.statusCode), null);
	// 		var data = JSON.parse(body);

	// 		if(data.kind == 'track')
	// 			callback(null, {track: this._makeResultFromTrack(data)});
	// 		else if(data.tracks){
	// 			var results = [];
	// 			var rf = [];

	// 			for(var i = 0; i < data.tracks.length; i++)
	// 				if(data.tracks[i].user && data.tracks[i].id)
	// 					results.push(this._makeResultFromTrack(data.tracks[i]));
	// 				else
	// 					rf.push(data.tracks[i]);
	// 			if(rf.length)
	// 				this._fetchTracks(rf, (err, data) => {
	// 					if(err)
	// 						return callback(err, null);
	// 					callback(null, {playlist: results.concat(data)});
	// 				})
	// 			else
	// 				callback(null, {playlist: results});
	// 		}else
	// 			callback(new Error('Unsupported soundcloud type ' + data.kind), null);
	// 	});
	// }

	async search(query, offset, limit = 20){
		var {res, body} = await soundcloudInterface.makeRequest('search/tracks', {q: encodeURIComponent(query), limit, offset});
		var data = body.collection;

		try{
			var results = new SoundcloudResults(query, offset + limit);

			for(var item of data)
				results.push(new SoundcloudTrack(item));
			return results;
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async get(id){
		var {res, body} = await soundcloudInterface.makeRequest('tracks/' + id);

		var result;

		try{
			result = new SoundcloudTrack(body);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}

		await result.loading_streams;

		return result;
	}
});

module.exports = api;