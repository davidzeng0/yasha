class APISource{
	constructor(api){
		this.api = require('./api/' + api);
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
}

const youtube = new class Youtube extends APISource{
	constructor(){
		super('Youtube');

		this.id_regex = /^([a-zA-Z0-9_-]{11})$/;
		this.playlist_regex = /^((?:PL|LL|FL|UU)[a-zA-Z0-9_-]+)$/;
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
		else if(url.hostname.match(/(?:www\.)?youtube\.com/) && url.pathname == '/watch')
			id = url.searchParams.get('v');
		var match = this.weak_match(id);

		list = url.searchParams.get('list');

		if(!this.playlist_regex.exec(list))
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
			list = this.api.playlistOnce(match.list);
		var result = await Promise.allSettled([track, list]);

		if(result[0].status == 'rejected' && result[1].status == 'rejected')
			throw result[0].reason;
		if(match.list && result[1].status == 'fulfilled'){
			if(result[0].status == 'fulfilled')
				result[1].value.setFirstTrack(result[0].value);
			return result[1].value;
		}

		return result[0].value;
	}

	async weak_resolve(match){
		try{
			return this.resolve(match);
		}catch(e){
			return null;
		}
	}

	async search(query){
		return this.api.search(query);
	}

	async playlistOnce(id, continuation){
		return this.api.playlistOnce(id, continuation);
	}

	async playlist(id, length){
		return this.api.playlist(id, length);
	}

	setCookie(cookie){
		this.api.setCookie(cookie);
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

		if(url.hostname == 'soundcloud.com' && url.pathname.startsWith('/') && url.pathname.length > 1)
			return url.href;
		return null;
	}

	async resolve(match){
		return await this.api.resolve(match);
	}

	async search(query){
		return this.api.search(query);
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
			return this.api.playlistOnce(match.playlist);
		if(match.album)
			return this.api.albumOnce(match.album);
	}

	async search(query){
		return this.api.search(query);
	}

	async playlistOnce(id, continuation){
		return this.api.playlistOnce(id, continuation);
	}
}

class Source{
	static resolve(input){
		var sources = [youtube, soundcloud, spotify];
		var match = null;

		for(var source of sources)
			if(match = source.match(input))
				return source.resolve(match);
		for(var source of sources)
			if(match = source.weak_match(input))
				return source.weak_resolve(match);
		return null;
	}
};

Source.Youtube = youtube;
Source.Soundcloud = soundcloud;
Source.Spotify = spotify;

module.exports = Source;