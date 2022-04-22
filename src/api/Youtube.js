const crypto = require('crypto');
const Request = require('../Request');
const SourceError = require('../SourceError');

const {Track, TrackImage, TrackResults, TrackPlaylist, TrackStream, TrackStreams} = require('../Track');
const {gen_playlist_continuation, gen_search_options} = require('../../proto/youtube');

function get_property(array, prop){
	if(!(array instanceof Array))
		return null;
	for(var item of array)
		if(item && item[prop])
			return item[prop];
	return null;
}

function text(txt){
	if(!txt)
		return null;
	if(txt.simpleText)
		return txt.simpleText;
	if(txt.runs)
		return txt.runs[0].text;
	return '';
}

function check_playable(st){
	if(!st)
		return;
	var {status, reason} = st;

	if(!status)
		return;
	switch(status.toLowerCase()){
		case 'ok':
			return;
		case 'error':
			if(reason == 'Video unavailable')
				throw new SourceError.NOT_FOUND('Video not found');
		case 'unplayable':
			throw new SourceError.UNPLAYABLE(reason || status);
		case 'login_required':
			throw new SourceError.UNPLAYABLE('Video is age restricted');
		case 'content_check_required':
			throw new SourceError.UNPLAYABLE('Content check required');
		case 'age_check_required':
			throw new SourceError.UNPLAYABLE('Age check required');
		default:
			throw new SourceError.UNPLAYABLE(reason || status);
	}
}

function number(n){
	n = parseInt(n, 10);

	if(Number.isFinite(n))
		return n;
	return 0;
}

function parse_timestamp(str){
	var tokens = str.split(':').map(token => parseInt(token));

	var scale = [1, 60, 3600, 86400];
	var seconds = 0;

	if(tokens.length > scale.length)
		return -1;
	for(var i = tokens.length - 1; i >= 0; i--){
		if(!Number.isInteger(tokens[i]))
			return -1;
		seconds += tokens[i] * scale[Math.min(3, tokens.length - i - 1)];
	}

	return seconds;
}

class YoutubeTrack extends Track{
	constructor(){
		super('Youtube');
	}

	from(video_details, author, streams){
		return this.setOwner(
			text(author.title),
			TrackImage.from(author.thumbnail.thumbnails)
		).setMetadata(
			video_details.videoId,
			video_details.title,
			number(video_details.lengthSeconds),
			TrackImage.from(video_details.thumbnail.thumbnails)
		).setStreams(
			streams
		);
	}

	from_search(track){
		var thumbnails;

		if(track.channelThumbnailSupportedRenderers)
			thumbnails = track.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer.thumbnail.thumbnails;
		else if(track.channelThumbnail)
			thumbnails = track.channelThumbnail.thumbnails;
		return this.setOwner(
			text(track.shortBylineText),
			TrackImage.from(thumbnails)
		).setMetadata(
			track.videoId,
			text(track.title),
			track.lengthText ? parse_timestamp(track.lengthText.simpleText) : -1,
			TrackImage.from(track.thumbnail.thumbnails),
		);
	}

	from_playlist(track){
		return this.setOwner(
			text(track.shortBylineText),
			null
		).setMetadata(
			track.videoId,
			text(track.title),
			number(track.lengthSeconds),
			TrackImage.from(track.thumbnail.thumbnails)
		).setPlayable(track.isPlayable ? true : false);
	}

	async fetch(){
		return await api.get(this.id);
	}

	async getStreams(){
		return await api.get_streams(this.id);
	}

	get url(){
		return 'https://www.youtube.com/watch?v=' + this.id;
	}
}

class YoutubeResults extends TrackResults{
	process(body){
		for(var item of body){
			if(item.continuationItemRenderer)
				this.set_continuation(item.continuationItemRenderer.continuationEndpoint.continuationCommand.token);
			else if(item.itemSectionRenderer)
				this.extract_tracks(item.itemSectionRenderer.contents);
		}
	}

	extract_tracks(list){
		for(var video of list)
			if(video.videoRenderer)
				this.push(new YoutubeTrack().from_search(video.videoRenderer));
	}

	set_continuation(cont){
		this.continuation = cont;
	}

	async next(){
		if(this.continuation)
			return await api.search(null, this.continuation);
		return null;
	}
}

class YoutubePlaylist extends TrackPlaylist{
	process(id, data, offset){
		this.id = id;

		for(var item of data){
			if(item.continuationItemRenderer)
				this.next_offset = offset + this.length;
			else if(item.playlistVideoRenderer)
				this.push(new YoutubeTrack().from_playlist(item.playlistVideoRenderer));
		}
	}

	async next(){
		if(this.next_offset)
			return await api.playlist_once(this.id, this.next_offset);
		return null;
	}

	get url(){
		return 'https://www.youtube.com/playlist?list=' + this.id;
	}
}

class YoutubeStream extends TrackStream{
	constructor(url, itag){
		super(url);

		this.itag = itag;
	}

	equals(other){
		return other instanceof YoutubeStream && this.itag && this.itag == other.itag;
	}
}

class YoutubeStreams extends TrackStreams{
	from(start, playerResponse){
		var loudness = 0;

		if(playerResponse.playerConfig?.audioConfig?.loudnessDb)
			loudness = playerResponse.playerConfig.audioConfig.loudnessDb;
		var {formats, adaptiveFormats, expiresInSeconds} = playerResponse.streamingData;

		if(!this.live && formats)
			this.extract_streams(formats, false);
		if(adaptiveFormats)
			this.extract_streams(adaptiveFormats, true);
		this.expire = start + parseInt(expiresInSeconds, 10) * 1000;
		this.set(Math.min(1, Math.pow(10, -loudness / 20)), playerResponse.videoDetails.isLive, start);

		return this;
	}

	expired(){
		return Date.now() > this.expire;
	}

	extract_streams(streams, adaptive){
		for(var fmt of streams){
			if(fmt.type == 'FORMAT_STREAM_TYPE_OTF')
				continue;
			var stream = new YoutubeStream(fmt.url, fmt.itag);

			if(this.live && adaptive)
				stream.setDuration(fmt.targetDurationSec);
			else
				stream.setDuration(parseInt(fmt.approxDurationMs, 10) / 1000);
			var mime = /(video|audio)\/([a-zA-Z0-9]{3,4});(?:\+| )codecs="(.*?)"/.exec(fmt.mimeType);

			if(!mime)
				continue;
			if(!adaptive)
				stream.setTracks(true, true);
			else if(mime[1] == 'video')
				stream.setTracks(true, false);
			else
				stream.setTracks(false, true);
			stream.setBitrate(fmt.bitrate);
			stream.setMetadata(mime[2], mime[3]);

			this.push(stream);
		}
	}
}

/* api requests and headers to youtube.com */
const api = new class YoutubeAPI{
	constructor(){
		this.innertube_client = {
			clientName: 'WEB',
			clientVersion: '2.20220331.06.00',
			gl: 'US',
			hl: 'en'
		};

		this.innertube_key = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

		this.cookie = '';
		this.sapisid = '';
	}

	async api_request(path, body = {}, query = '', origin = 'www'){
		/* youtube v1 api */
		var time = Date.now();
		var options = {headers: {}};

		body.context = {client: {...this.innertube_client}};
		options.method = 'POST';
		options.headers.origin = `https://${origin}.youtube.com`;

		if(path == 'player'){
			body.contentCheckOk = true;
			body.racyCheckOk = true;
			body.context.client.clientName = 'ANDROID';
			body.context.client.clientVersion = '17.14.2';
		}

		if(this.sapisid){
			var hash;

			time = Math.floor(time / 1000);
			hash = crypto.createHash('sha1').update(`${time} ${this.sapisid} https://www.youtube.com`).digest('hex');

			options.headers.authorization = 'SAPISIDHASH ' + time + '_' + hash;
			options.headers.cookie = this.cookie;
		}

		options.body = JSON.stringify(body);

		var {res} = await Request.getResponse(`https://${origin}.youtube.com/youtubei/v1/${path}?key=${this.innertube_key}${query}&prettyPrint=false`, options);
		var body;

		try{
			body = await res.text();
		}catch(e){
			if(!res.ok)
				throw new SourceError.INTERNAL_ERROR(null, e);
			throw new SourceError.NETWORK_ERROR(null, e);
		}

		if(res.status >= 400 && res.status < 500)
			throw new SourceError.NOT_FOUND(null, new Error(body));
		if(!res.ok)
			throw new SourceError.INTERNAL_ERROR(null, new Error(body));
		try{
			body = JSON.parse(body);
		}catch(e){
			throw new SourceError.INVALID_RESPONSE(null, e);
		}

		return body;
	}

	async get(id){
		var start = Date.now();
		var responses = [
			this.api_request('next', {videoId: id}),
			this.api_request('player', {videoId: id})
		];

		try{
			responses = await Promise.all(responses);
		}catch(e){
			if(e.code == SourceError.codes.NOT_FOUND)
				e.message = 'Video not found';
			throw e;
		}


		var response = responses[0];
		var player_response = responses[1];

		if(!response || !player_response)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing data'));
		check_playable(player_response.playabilityStatus);

		var video_details = player_response.videoDetails;

		try{
			var author = get_property(response.contents.twoColumnWatchNextResults.results.results.contents, 'videoSecondaryInfoRenderer').owner.videoOwnerRenderer;

			return new YoutubeTrack().from(video_details, author, new YoutubeStreams().from(start, player_response));
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async get_streams(id){
		var start = Date.now();
		var player_response = await this.api_request('player', {videoId: id});

		if(!player_response)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing data'));
		check_playable(player_response.playabilityStatus);

		try{
			return new YoutubeStreams().from(start, player_response);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async playlist_once(id, start = 0){
		var results = new YoutubePlaylist();
		var data = await this.api_request('browse', {continuation: gen_playlist_continuation(id, start)});

		if(!data.sidebar)
			throw new SourceError.NOT_FOUND('Playlist not found');
		if(!data.onResponseReceivedActions)
			return results;
		try{
			var details = get_property(data.sidebar.playlistSidebarRenderer.items, 'playlistSidebarPrimaryInfoRenderer');

			results.setMetadata(text(details.title), text(details.description));
			results.process(id, data.onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems, start);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}

		return results;
	}

	async playlist(id, limit){
		var list = null;
		var offset = 0;

		do{
			var result = await this.playlist_once(id, offset);

			if(!list)
				list = result;
			else
				list = list.concat(result);
			offset = result.next_offset;
		}while(offset && (!limit || list.length < limit));

		return list;
	}

	async search(query, continuation){
		var body = await this.api_request('search', continuation ? {continuation} : {query, params: gen_search_options({type: 'video'})});

		if(continuation){
			if(!body.onResponseReceivedCommands)
				throw new SourceError.NOT_FOUND('Search continuation token not found');
			try{
				body = body.onResponseReceivedCommands[0].appendContinuationItemsAction.continuationItems;
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}
		}else{
			try{
				body = body.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents;
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}
		}

		var results = new YoutubeResults();

		try{
			results.process(body);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}

		return results;
	}

	set_cookie(cookiestr){
		if(!cookiestr){
			this.cookie = '';
			this.sapisid = '';

			return;
		}

		var cookies = cookiestr.split(';');
		var sapisid = null;

		for(var cookie of cookies){
			cookie = cookie.trim().split('=');

			if(cookie[0] == '__Secure-3PAPISID')
				sapisid = cookie[1];
			else if(cookie[0] == 'SAPISID'){
				sapisid = cookie[1];

				break;
			}
		}

		if(!sapisid)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Invalid Cookie'));
		this.sapisid = sapisid;
		this.cookie = cookiestr;
	}

	track_match_artist_match(a, b){
		for(var artist of a.artists)
			if(b.artists.includes(artist))
				return true;
		return false;
	}

	track_match_title_match(a, b){
		a = a.title.toLowerCase();
		b = b.title.toLowerCase();

		return a.includes(b) || b.includes(a);
	}

	track_match_best_result(results, track, aggr = false, dur = true){
		var durmatch = null;

		if(results.topResult){
			if(results.topResult.type == 'song')
				return results.topResult;
			if(results.songs && results.songs.length){
				for(var song of results.songs){
					if(this.track_match_artist_match(track, song) && this.track_match_title_match(track, song))
						return song;
				}
			}

			return results.topResult;
		}

		for(var result of results){
			if(this.track_match_artist_match(track, result) && this.track_match_title_match(track, result))
				return result;
			if(!durmatch && track.duration != -1 && result.duration != -1 && Math.abs(result.duration - track.duration) < 5)
				durmatch = result;
		}

		if(aggr)
			return null;
		if(durmatch)
			return durmatch;
		if(!dur)
			return null;
		return results.length ? results[0] : null;
	}

	async track_match_lookup(track){
		var results = await music.search(track.artists.join(' ') + ' ' + track.title);
		var expmatch = results.filter((t) => t.explicit == track.explicit);
		var match = null;

		if(results.topResult && results.topResult.explicit == track.explicit)
			expmatch.topResult = results.topResult;
		if(results.songs)
			expmatch.songs = results.songs.filter((t) => t.explicit == track.explicit);
		try{
			match = this.track_match_best_result(expmatch, track, true);

			if(match)
				return match;
			match = this.track_match_best_result(results, track, false, false);

			if(match)
				return match;
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}

		results = await results.next();

		try{
			return this.track_match_best_result(results, track);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async track_match(track){
		if(track.youtube_id){
			try{
				return await this.get_streams(track.youtube_id);
			}catch(e){

			}
		}

		var result = await this.track_match_lookup(track);

		if(result){
			var id = result.id;

			result = await result.getStreams();
			track.youtube_id = id;

			return result;
		}

		throw new SourceError.UNPLAYABLE('Could not find streams for this track');
	}
}

class YoutubeMusicTrack extends YoutubeTrack{
	constructor(){
		super('Youtube');
	}

	parse_metadata(has_type, metadata){
		var type, artists = [], duration;
		var found = has_type ? 0 : 1;

		for(var i = 0; i < metadata.length; i++){
			var text = metadata[i].text;

			if(text == ' • '){
				found++;

				continue;
			}

			switch(found){
				case 0: /* type */
					type = text;

					break;
				case 1: /* artists */
					artists.push(text);

					if(metadata[i + 1].text != ' • ')
						i++;
					break;
				case 2: /* album */
					break;
				case 3: /* duration */
					duration = parse_timestamp(text);

					break;
			}
		}

		return {type, artists, duration};
	}

	from_search(track, has_type){
		if(!track.playlistItemData)
			return;
		var {type, artists, duration} = this.parse_metadata(has_type, track.flexColumns[1].musicResponsiveListItemFlexColumnRenderer.text.runs);

		if(has_type){
			type = type.toLowerCase();

			if(type != 'video' && type != 'song')
				return;
			this.type = type;
		}else{
			this.type = 'song';
		}

		this.explicit = false;
		this.artists = artists;

		if(track.badges){
			for(var badge of track.badges){
				if(badge.musicInlineBadgeRenderer?.icon?.iconType == 'MUSIC_EXPLICIT_BADGE'){
					this.explicit = true;

					break;
				}
			}
		}

		return this.setOwner(
			artists.join(', '),
			null
		).setMetadata(
			track.playlistItemData.videoId,
			text(track.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text),
			duration,
			TrackImage.from(track.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails),
		);
	}

	from_section(track){
		return this.from_search(track, true);
	}
}

class YoutubeMusicResults extends TrackResults{
	process(body){
		if(body instanceof Array){
			for(var section of body)
				if(section.musicShelfRenderer)
					this.process_section(section.musicShelfRenderer);
			return;
		}

		this.process_once(body);
	}

	process_section(section){
		var section_name = text(section.title);

		if(!section_name)
			return;
		section_name = section_name.toLowerCase();

		switch(section_name){
			case 'songs':
				if(section.bottomEndpoint)
					this.set_browse(section.bottomEndpoint.searchEndpoint.query, section.bottomEndpoint.searchEndpoint.params);
			case 'top result':
			case 'videos':
				var tracks = this.from_section(section.contents);

				if(section_name == 'top result' && tracks.length)
					this.topResult = tracks[0];
				if(section_name == 'songs')
					this.songs = tracks;
				this.push(...tracks);

				break;
		}
	}

	from_section(list){
		var tracks = [];

		for(var video of list)
			if(video.musicResponsiveListItemRenderer){
				video = new YoutubeMusicTrack().from_section(video.musicResponsiveListItemRenderer);

				if(video)
					tracks.push(video);
			}
		return tracks;
	}

	process_once(body){
		this.extract_tracks(body.contents);

		if(body.continuations && body.continuations.length)
			this.set_continuation(body.continuations[0].nextContinuationData.continuation);
	}

	extract_tracks(list){
		for(var video of list)
			if(video.musicResponsiveListItemRenderer){
				video = new YoutubeMusicTrack().from_search(video.musicResponsiveListItemRenderer);

				if(video)
					this.push(video);
			}
	}

	set_continuation(cont){
		this.continuation = cont;
	}

	set_browse(query, params){
		this.browse = params;
		this.query = query;
	}

	async next(){
		if(this.browse)
			return await music.search(this.query, null, this.browse);
		if(this.continuation)
			return await music.search(null, this.continuation);
		return null;
	}
}

var music = new class YoutubeMusic{
	constructor(){
		this.innertube_client = {
			clientName: 'WEB_REMIX',
			clientVersion: '1.20220328.01.00',
			gl: 'US',
			hl: 'en'
		};

		this.innertube_key = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
	}

	get cookie(){
		return api.cookie;
	}

	get sapisid(){
		return api.sapisid;
	}

	async api_request(path, body, query){
		return api.api_request.call(this, path, body, query, 'music');
	}

	async search(search, continuation, params){
		var query, body;

		if(continuation)
			query = '&continuation=' + continuation + '&type=next';
		else
			body = {query: search, params};
		body = await this.api_request('search', body, query);

		if(continuation){
			if(!body.continuationContents)
				throw new SourceError.NOT_FOUND('Search continuation token not found');
			try{
				body = body.continuationContents.musicShelfContinuation;
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}
		}else{
			try{
				body = body.contents.tabbedSearchResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents;
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}

			if(params)
				body = get_property(body, 'musicShelfRenderer');
		}

		var results = new YoutubeMusicResults();

		try{
			results.process(body);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}

		return results;
	}
}

module.exports = api;
module.exports.Music = music;
module.exports.Track = YoutubeTrack;
module.exports.Results = YoutubeResults;
module.exports.Playlist = YoutubePlaylist;