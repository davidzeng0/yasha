const { NotATrackError } = require('./Error');

class APISource{
	constructor(api){
		this.name = api;
		this.api = require('./api/' + api);

		this.Track = this.api.Track;
		this.Results = this.api.Results;
		this.Playlist = this.api.Playlist;
	}

	match(content){
		return null;
	}

	weak_match(content){
		return null;
	}

	matches(content){
		return this.match(content) ? true : false;
	}

	async resolve(match){
		return null;
	}

	async get(id){
		return this.api.get(id);
	}

	async getStreams(id){
		return this.api.get_streams(id);
	}

	async search(query){
		return null;
	}

	async playlistOnce(id){
		return null;
	}

	async playlist(id, length){
		return this.api.playlist(id, length);
	}
}

const youtube = new class Youtube extends APISource{
	constructor(){
		super('Youtube');

		this.Music = this.api.Music;

		this.id_regex = /^([\w_-]{11})$/;
	}

	weak_match(id){
		if(this.id_regex.exec(id))
			return {id};
		return null;
	}

	match(content){
		var url;

		try{
			url = new URL(content);
		}catch(e){
			return null;
		}

		var id = null, list = null;

		if(url.hostname == 'youtu.be')
			id = url.pathname.substring(1);
		else if((url.hostname == 'www.youtube.com' || url.hostname == 'music.youtube.com' || url.hostname == 'youtube.com') && url.pathname == '/watch')
			id = url.searchParams.get('v');
		var match = this.weak_match(id);

		list = url.searchParams.get('list');

		if(!list)
			return match;
		if(!match)
			match = {};
		match.list = list;

		return match;
	}

	async resolve(match){
		var track = null, list = null;

		if(match.id)
			track = this.api.get(match.id);
		if(match.list)
			list = this.api.playlist_once(match.list);
		var result = await Promise.allSettled([track, list]);

		track = result[0].value;
		list = result[1].value;

		if(!track && !list)
			throw match.id ? result[0].reason : result[1].reason;
		if(list){
			if(track)
				list.setFirstTrack(track);
			return list;
		}

		return track;
	}

	async weak_resolve(match){
		try{
			return this.resolve(match);
		}catch(e){
			return null;
		}
	}

	async search(query, continuation){
		return this.api.search(query, continuation);
	}

	async playlistOnce(id, start){
		return this.api.playlist_once(id, start);
	}

	setCookie(cookie){
		this.api.set_cookie(cookie);
	}
};

const soundcloud = new class Soundcloud extends APISource{
	constructor(){
		super('Soundcloud');
	}

	match(content){
		var url;

		try{
			url = new URL(content);
		}catch(e){
			return null;
		}

		if(url.pathname.startsWith('/') && url.pathname.length > 1){
			if(url.hostname == 'soundcloud.com')
				return {soundcloud: url.href};
			else if(url.hostname == 'on.soundcloud.com')
				return {shortlink: url.pathname.substring(1)};
		}

		return null;
	}

	async resolve(match){
		try{
			if(match.shortlink)
				return await this.api.resolve_shortlink(match.shortlink);
			return await this.api.resolve(match.soundcloud);
		}catch(e){
			if(e instanceof NotATrackError)
				return null;
			throw e;
		}
	}

	async search(query, offset, length){
		return this.api.search(query, offset, length);
	}

	async playlistOnce(id, offset, length){
		return this.api.playlist_once(id, offset, length);
	}
}

const spotify = new class Spotify extends APISource{
	constructor(){
		super('Spotify');
	}

	match(content){
		var url;

		try{
			url = new URL(content);
		}catch(e){
			return null;
		}

		if(url.hostname == 'open.spotify.com' && url.pathname.startsWith('/') && url.pathname.length > 1){
			var data = url.pathname.substring(1).split('/');

			if(data.length != 2)
				return null;
			switch(data[0]){
				case 'track':
					return {track: data[1]};
				case 'album':
					return {album: data[1]};
				case 'playlist':
					return {playlist: data[1]};
			}
		}

		return null;
	}

	async resolve(match){
		if(match.track)
			return this.api.get(match.track);
		if(match.playlist)
			return this.api.playlist_once(match.playlist);
		if(match.album)
			return this.api.album_once(match.album);
	}

	async search(query, offset, length){
		return this.api.search(query, offset, length);
	}

	async playlistOnce(id, offset, length){
		return this.api.playlist_once(id, offset, length);
	}

	async albumOnce(id, offset, length){
		return this.api.album_once(id, offset, length);
	}

	setCookie(cookie){
		this.api.set_cookie(cookie);
	}
}

const apple = new class AppleMusic extends APISource{
	constructor(){
		super('AppleMusic');
	}

	match(content){
		var url;

		try{
			url = new URL(content);
		}catch(e){
			return null;
		}

		if(url.hostname == 'music.apple.com' && url.pathname.startsWith('/') && url.pathname.length > 1){
			var path = url.pathname.substring(1).split('/');

			if(path.length < 2)
				return null;
			if(path[0] != 'playlist' && path[0] != 'album' && path[0] != 'song')
				path.shift();
			if(path.length < 2)
				return null;
			switch(path[0]){
				case 'song':
					return {track: path[1]};
				case 'playlist':
					return {playlist: path[2] ?? path[1]};
				case 'album':
					var track = url.searchParams.get('i');

					if(track)
						return {track};
					return {album: path[2] ?? path[1]};
			}
		}

		return null;
	}

	async resolve(match){
		if(match.track)
			return this.api.get(match.track);
		if(match.playlist)
			return this.api.playlist_once(match.playlist);
		if(match.album)
			return this.api.album_once(match.album);
	}

	async search(query, offset, length){
		return this.api.search(query, offset, length);
	}

	async playlistOnce(id, offset, length){
		return this.api.playlist_once(id, offset, length);
	}

	async albumOnce(id, offset, length){
		return this.api.album_once(id, offset, length);
	}
}

const file = new class File extends APISource{
	constructor(){
		super('File');
	}

	resolve(content){
		var url;

		try{
			url = new URL(content);
		}catch(e){
			return null;
		}

		if(url.protocol == 'http:' || url.protocol == 'https:')
			return this.api.create(content);
		if(url.protocol == 'file:')
			return this.api.create(content, true);
		return null;
	}
}

class Source{
	static async resolve(input, weak = true){
		var sources = [youtube, soundcloud, spotify, apple];
		var match = null;

		for(var source of sources)
			if(match = source.match(input))
				return source.resolve(match);
		if(!weak)
			return null;
		for(var source of sources)
			if(match = source.weak_match(input))
				return source.weak_resolve(match);
		return null;
	}
};

Source.Youtube = youtube;
Source.Soundcloud = soundcloud;
Source.Spotify = spotify;
Source.AppleMusic = apple;
Source.File = file;

module.exports = Source;