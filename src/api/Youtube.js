const crypto = require('crypto');
const Request = require('../Request');
const SourceError = require('../SourceError');

const {Track, TrackImage, TrackResults, TrackPlaylist, TrackStream, TrackStreams} = require('../Track');
const {gen_playlist_continuation, gen_search_options, playlist_next_offset} = require('../../proto/youtube');

function get_property(array, prop){
	if(!(array instanceof Array))
		return null;
	for(const item of array)
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
		const {status, reason} = st;

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
	const tokens = str.split(':').map(token => parseInt(token));

	const scale = [1, 60, 3600, 86400];
	let seconds = 0;

	if(tokens.length > scale.length)
		return -1;
	for(let i = tokens.length - 1; i >= 0; i--){
		if(!Number.isInteger(tokens[i]))
			return -1;
		seconds += tokens[i] * scale[Math.min(3, tokens.length - i - 1)];
	}

	return seconds;
}

function youtube_thumbnails(video_id){
	return [new TrackImage(`https://i.ytimg.com/vi/${video_id}/mqdefault.jpg`, 320, 180)]
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
			youtube_thumbnails(video_details.videoId)
		).setStreams(
			streams
		);
	}

	from_search(track){
		let thumbnails;

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
			youtube_thumbnails(track.videoId)
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
			youtube_thumbnails(track.videoId)
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
		for(const item of body){
			if(item.continuationItemRenderer)
				this.set_continuation(item.continuationItemRenderer.continuationEndpoint.continuationCommand.token);
			else if(item.itemSectionRenderer)
				this.extract_tracks(item.itemSectionRenderer.contents);
		}
	}

	extract_tracks(list){
		for(const video of list)
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

		for(const item of data){
			if(item.continuationItemRenderer)
				this.next_offset = playlist_next_offset(item.continuationItemRenderer.continuationEndpoint.continuationCommand.token);
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
		let loudness = 0;

		if(playerResponse.playerConfig?.audioConfig?.loudnessDb)
			loudness = playerResponse.playerConfig.audioConfig.loudnessDb;
		const {formats, adaptiveFormats, expiresInSeconds} = playerResponse.streamingData;

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
		for(const fmt of streams){
			if(fmt.type == 'FORMAT_STREAM_TYPE_OTF')
				continue;
				const stream = new YoutubeStream(fmt.url, fmt.itag);

			if(this.live && adaptive)
				stream.setDuration(fmt.targetDurationSec);
			else
				stream.setDuration(parseInt(fmt.approxDurationMs, 10) / 1000);
			const mime = /(video|audio)\/([a-zA-Z0-9]{3,4});(?:\+| )codecs="(.*?)"/.exec(fmt.mimeType);

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
			stream.default_audio_track = fmt.audioTrack?.audioIsDefault;

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
		let time = Date.now();
		const options = {headers: {}};

		body.context = {client: {...this.innertube_client}};
		options.method = 'POST';
		options.headers.origin = `https://${origin}.youtube.com`;

		if(path == 'player'){
			body.contentCheckOk = true;
			body.racyCheckOk = true;
			body.context.client.clientName = 'ANDROID';
			body.context.client.clientVersion = '18.15.35';
			body.context.client.androidSdkVersion = 33;
			options.headers['User-Agent'] = 'com.google.android.youtube/18.15.35';
		}

		if(this.sapisid){
			let hash;

			time = Math.floor(time / 1000);
			hash = crypto.createHash('sha1').update(`${time} ${this.sapisid} https://${origin}.youtube.com`).digest('hex');

			options.headers.authorization = 'SAPISIDHASH ' + time + '_' + hash;
			options.headers.cookie = this.cookie;
		}

		options.body = JSON.stringify(body);

		const {res} = await Request.getResponse(`https://${origin}.youtube.com/youtubei/v1/${path}?key=${this.innertube_key}${query}&prettyPrint=false`, options);
		let body;

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
		const start = Date.now();
		let responses = [
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


		const response = responses[0];
		const player_response = responses[1];

		if(!response || !player_response)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing data'));
		check_playable(player_response.playabilityStatus);

		const video_details = player_response.videoDetails;

		try{
			const author = get_property(response.contents.twoColumnWatchNextResults.results.results.contents, 'videoSecondaryInfoRenderer').owner.videoOwnerRenderer;

			return new YoutubeTrack().from(video_details, author, new YoutubeStreams().from(start, player_response));
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async get_streams(id){
		const start = Date.now();
		const player_response = await this.api_request('player', {videoId: id});

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
		const results = new YoutubePlaylist();
		const data = await this.api_request('browse', {continuation: gen_playlist_continuation(id, start)});

		if(!data.sidebar)
			throw new SourceError.NOT_FOUND('Playlist not found');
		if(!data.onResponseReceivedActions)
			return results;
		try{
			const details = get_property(data.sidebar.playlistSidebarRenderer.items, 'playlistSidebarPrimaryInfoRenderer');

			results.setMetadata(text(details.title), text(details.description));
			results.process(id, data.onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems, start);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}

		return results;
	}

	async playlist(id, limit){
		let list = null;
		let offset = 0;

		do{
			const result = await this.playlist_once(id, offset);

			if(!list)
				list = result;
			else
				list = list.concat(result);
			offset = result.next_offset;
		}while(offset && (!limit || list.length < limit));

		return list;
	}

	async search(query, continuation){
		let body = await this.api_request('search', continuation ? {continuation} : {query, params: gen_search_options({type: 'video'})});

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

		const results = new YoutubeResults();

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

		const cookies = cookiestr.split(';');
		let sapisid = null;

		for(const cookie of cookies){
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

	string_word_match(big, small){
		const boundary = (c) => /[\s\W]/g.test(c);

		big = big.toLowerCase();
		small = small.toLowerCase();

		if(!big.length || !small.length || boundary(small[0]))
			return 0;
		let l = 0, r = small.length;

		while(l < r){
			const mid = (r + l + 1) >> 1;

			if(big.includes(small.substring(0, mid)))
				l = mid;
			else
				r = mid - 1;
		}

		if(l == small.length)
			return l;
		for(let i = l - 1; i > 0; i--)
			if(boundary(small[i]))
				return i;
		return 0;
	}

	track_match_score(track, result){
		let score = 0;

		if(track.duration != -1 && result.duration != -1){
			const diff = Math.abs(Math.round(track.duration) - Math.round(result.duration));

			if(diff > 5)
				return 0;
			score += 5 - diff;
		}

		const length = Math.max(track.artists.length, result.artists ? result.artists.length : 1);

		for(const artist of track.artists){
			artist = artist.toLowerCase();

			if(!result.artists){
				if(this.string_word_match(result.author, artist) > 0){
					score += 5 * (artist.length / result.author.length);

					break;
				}
			}else for(const result_artist of result.artists){
				if(result_artist.toLowerCase() == artist){
					score += 5 / length;

					break;
				}
			}
		}

		score += 5 * this.string_word_match(result.title, track.title) / result.title.length;

		return score / 15;
	}

	track_match_best(results, track){
		for(let i = 0; i < results.length; i++){
			results[i] = {
				score: this.track_match_score(track, results[i]),
				track: results[i]
			};
		}

		results = results.filter(match => match.score >= 0.5);
		results.sort((a, b) => b.score - a.score);

		return results.length ? results[0].track : null;
	}

	track_match_best_result(results, track){
		const list = []
		let result;

		if(results.top_result)
			list.push(results.top_result);
		if(results.songs)
			list.push(...results.songs);
		result = this.track_match_best(list, track);

		if(result)
			return result;
		return this.track_match_best(results, track);
	}

	async track_match_lookup(track){
		const title = [...track.artists, track.title].join(' ');
		let results = await music.search(title);
		const expmatch = results.filter((t) => t.explicit == track.explicit);

		if(results.top_result && results.top_result.explicit == track.explicit)
			expmatch.top_result = results.top_result;
		if(results.songs)
			expmatch.songs = results.songs.filter((t) => t.explicit == track.explicit);
		let match = this.track_match_best_result(expmatch, track);

		if(match)
			return match;
		match = this.track_match_best_result(results, track);

		if(match)
			return match;
		results = await this.search(title);

		return this.track_match_best_result(results, track);
	}

	async track_match(track){
		if(track.youtube_id){
			try{
				return await this.get_streams(track.youtube_id);
			}catch(e){
				/* continue */
			}
		}

		let result = await this.track_match_lookup(track);

		if(result){
			const id = result.id;

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
		const artists = []
		let type, duration, found = has_type ? 0 : 1;

		for(let i = 0; i < metadata.length; i++){
			const text = metadata[i].text;

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
		let {type, artists, duration} = this.parse_metadata(has_type, track.flexColumns[1].musicResponsiveListItemFlexColumnRenderer.text.runs);

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
			for(const badge of track.badges){
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
			youtube_thumbnails(track.playlistItemData.videoId)
		);
	}

	from_section(track){
		return this.from_search(track, true);
	}
}

class YoutubeMusicResults extends TrackResults{
	process(body){
		if(body instanceof Array){
			for(const section of body)
				if(section.musicShelfRenderer)
					this.process_section(section.musicShelfRenderer);
			return;
		}

		this.process_once(body);
	}

	process_section(section){
		let section_name = text(section.title);

		if(!section_name)
			return;
		section_name = section_name.toLowerCase();

		switch(section_name){
			case 'songs':
				if(section.bottomEndpoint)
					this.set_browse(section.bottomEndpoint.searchEndpoint.query, section.bottomEndpoint.searchEndpoint.params);
			case 'top result':
			case 'videos':
				const tracks = this.from_section(section.contents);

				if(section_name == 'top result' && tracks.length)
					this.top_result = tracks[0];
				if(section_name == 'songs')
					this.songs = tracks;
				this.push(...tracks);

				break;
		}
	}

	from_section(list){
		const tracks = [];

		for(const video of list)
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
		for(const video of list)
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

const music = new class YoutubeMusic{
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
		let query, body;

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

		const results = new YoutubeMusicResults();

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