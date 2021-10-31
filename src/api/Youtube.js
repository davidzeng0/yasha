const crypto = require('crypto');
const Request = require('../Request');
const SourceError = require('../SourceError');
const {Track, TrackImage, TrackResults, TrackPlaylist, TrackStream, TrackStreams} = require('../Track');

/* decodes signatures and n */
var decoder = (function(){
	var js_variable = '[\\w_\\$][\\w\\d]*';
	var js_singlequote_string = '\'[^\'\\\\]*(:?\\\\[\\s\\S][^\'\\\\]*)*\'';
	var js_doublequote_string = '"[^"\\\\]*(:?\\\\[\\s\\S][^"\\\\]*)*"';
	var js_string = '(?:' + js_singlequote_string + '|' + js_doublequote_string + ')';
	var js_key_string = '(?:' + js_variable + '|' + js_string + ')';
	var js_property_string = '(?:\\.' + js_variable + '|\\[' + js_string + '\\])';
	var js_empty_string = '(?:\'\'|"")';
	var js_capturing_string = '(?:\'([^\'\\\\]*(:?\\\\[\\s\\S][^\'\\\\]*)*)\'|"([^"\\\\]*(:?\\\\[\\s\\S][^"\\\\]*)*)")';
	var js_capturing_key = '(' + js_variable + ')|' + js_capturing_string;

	function process_switch_content(switch_content, def){
		var code = [
			{
				content: 'case \\d+?:',
				process: function(content){
					return {type: 'case', value: parseInt(/case (\d+?):/.exec(content)[1])};
				}
			},
			{
				content: 'default:',
				process: function(content){
					return {type: 'default'};
				}
			},
			{
				content: 'f-=\\d+?;|f+=\\d+?;|f=\\d+;?',
				process: function(content){
					content = /f(-=|\+=|=)(\d+);?/.exec(content);

					return {type: 'code', value: [content[1], parseInt(content[2])]};
				},

				do: function(f, h, data){
					switch(data[0]){
						case '-=':
							f -= data[1];

							break;
						case '+=':
							f += data[1];

							break;
						case '=':
							f = data[1];

							break;
					}

					return f;
				}
			},
			{
				content: 'h\\.push\\(String\\.fromCharCode\\(f\\)\\);?',
				process: function(content){
					return {type: 'code'};
				},

				do: function(f, h, data){
					h.push(String.fromCharCode(f));

					return f;
				}
			},
			{
				content: 'continue;?',
				process: function(content){
					return {type: 'continue'};
				}
			},
			{
				content: 'break;?',
				process: function(content){
					return {type: 'break'};
				}
			}
		];

		var content = [];
		var default_index = -1;

		if(switch_content){
			var content_regex = new RegExp(code.map((c => '(' + c.content + ')')).join('|'), 'g');
			var result;

			while(result = content_regex.exec(switch_content)){
				for(var i = 1; i < result.length; i++){
					if(result[i] !== undefined){
						var c = code[i - 1].process(result[i]);

						c.index = i - 1;
						content.push(c);

						if(c.type == 'default')
							default_index = content.length;
						break;
					}
				}
			}
		}

		var f = 64, h = [], iterations = 0;

		while(++f - h.length - 32){
			if(++iterations >= 256)
				break;
			var matched_case = false;
			var case_continue = false;

			for(var i = 0; i < content.length; i++){
				if(!matched_case){
					if(content[i].type == 'case' && f == content[i].value)
						matched_case = true;
				}else{
					if(content[i].type == 'continue'){
						case_continue = true;

						break;
					}else if(content[i].type == 'break'){
						break;
					}else if(content[i].type == 'code'){
						f = code[content[i].index].do(f, h, content[i].value);
					}
				}
			}

			if(case_continue)
				continue;
			if(!matched_case && default_index != -1){
				for(var i = default_index; i < content.length; i++){
					if(content[i].type == 'continue'){
						case_continue = true;

						break;
					}else if(content[i].type == 'break'){
						break;
					}else if(content[i].type == 'code'){
						f = code[content[i].index].do(f, h, content[i].value);
					}
				}
			}

			if(def){
				if(case_continue)
					continue;
				h.push(String.fromCharCode(f));
			}
		}

		return function(d, e){
			var k = f;

			d.forEach(function(l, m, n){
				this.push(n[m] = h[(h.indexOf(l) - h.indexOf(this[m]) + m - 32 + k--) % h.length]);
			}, e.split(''));
		}
	}

	return new (class{
		constructor(){
			this.signature_decode = [];
			this.n_decode = {};
		}

		process(body){
			this.signature_decode = [];
			this.n_decode = {};

			this.get_signature_decode(body);
			this.get_n_decode(body);
		}

		get_signature_decode(body){
			var functions = [
				{
					name: 'reverse',
					content: ':function\\(a\\)\\{(?:return )?a\\.reverse\\(\\)\\}'
				},
				{
					name: 'slice',
					content: ':function\\(a,b\\)\\{return a\\.slice\\(b\\)\\}'
				},
				{
					name: 'splice',
					content: ':function\\(a,b\\)\\{a\\.splice\\(0,b\\)\\}'
				},
				{
					name: 'swap',
					content: ':function\\(a,b\\)\\{var c=a\\[0\\];a\\[0\\]=a\\[b(?:%a\\.length)\\];a\\[b(?:%a\\.length)?\\]=c(?:;return a)?\\}'
				}
			];

			var function_defs = new RegExp('var (' + js_variable + ')=\\{((?:(?:' +
										functions.map((f) => js_key_string + f.content).join('|') + '),?\\r?\\n?)+)\\};');
			var function_execs = new RegExp('function(?: ' + js_variable + ')?\\(a\\)\\{a=a\\.split\\(' +
										js_empty_string + '\\);\\s*((?:(?:a=)?' + js_variable + js_property_string + '\\(a,\\d+\\);)*)return a\\.join\\(' +
										js_empty_string + '\\)\\}');
			var defs = function_defs.exec(body);
			var acts = function_execs.exec(body);
			var obj = defs[1];
			var objBody = defs[2];
			var funcBody = acts[1];

			for(var i = 0; i < functions.length; i++){
				var match = new RegExp('(' + js_key_string + ')' + functions[i].content, 'g');
				var result = match.exec(objBody);

				if(result)
					functions[i].key = result[1];
				else
					functions[i].key = '';
			}

			var keys = '(' + functions.map((f) => f.key).join('|') + ')';
			var tokenize = new RegExp('(?:a=)?' + obj + '(?:\\.' + keys + '|\\[\'' + keys + '\'\\]|\\["' + keys + '"\\])\\(a,(\\d+)\\)', 'g');
			var result;

			while(result = tokenize.exec(funcBody)){
				const key = result[1] || result[2] || result[3];
				const val = result[4];

				if(key == functions[0].key)
					this.signature_decode.push(0);
				else{
					if(key == functions[3].key)
						this.signature_decode.push(1);
					else if(key == functions[1].key)
						this.signature_decode.push(2);
					else if(key == functions[2].key)
						this.signature_decode.push(3);
					this.signature_decode.push(parseInt(val, 10));
				}
			}
		}

		get_n_decode(body){
			var functions = [
				{
					content: 'function\\(d,e\\)\\{e=\\(e%d\\.length\\+d\\.length\\)%d\\.length;d\\.splice\\(e,1\\)\\}',
					process: function(content){
						return function(d, e){
							e = (e % d.length + d.length) % d.length;
							d.splice(e, 1);
						}
					}
				},
				{
					content: 'function\\(d,e\\)\\{e=\\(e%d\\.length\\+d\\.length\\)%d\\.length;var f=d\\[0\\];d\\[0\\]=d\\[e\\];d\\[e\\]=f\\}',
					process: function(content){
						return function(d, e){
							var f = d[0];

							e = (e % d.length + d.length) % d.length;
							d[0] = d[e];
							d[e] = f;
						}
					}
				},
				{
					content: 'function\\(d,e\\)\\{d\\.push\\(e\\)\\}',
					process: function(content){
						return function(d, e){
							d.push(e);
						}
					}
				},
				{
					content: 'function\\(d\\)\\{for\\(var e=d\\.length;e;\\)d\\.push\\(d\\.splice\\(--e,1\\)\\[0\\]\\)\\}',
					process: function(content){
						return function(d){
							for(var e = d.length; e; )
								d.push(d.splice(--e, 1)[0]);
						}
					}
				},
				{
					content: 'function\\(d\\)\\{d\\.reverse\\(\\)\\}',
					process: function(content){
						return function(d){
							d.reverse();
						}
					}
				},
				{
					content: 'function\\(d,e\\)\\{e=\\(e%d\\.length\\+d\\.length\\)%d\\.length;d\\.splice\\(-e\\)\\.reverse\\(\\)\\.forEach\\(function\\(f\\)\\{d\\.unshift\\(f\\)\\}\\)\\}',
					process: function(content){
						return function(d, e){
							e = (e % d.length + d.length) % d.length;
							d.splice(-e).reverse().forEach(function(f){
								d.unshift(f);
							});
						}
					}
				},
				{
					content: 'function\\(d,e\\)\\{e=\\(e%d\\.length\\+d\\.length\\)%d\\.length;d\\.splice\\(0,1,d\\.splice\\(e,1,d\\[0\\]\\)\\[0\\]\\)\\}',
					process: function(content){
						return function(d, e){
							e = (e % d.length + d.length) % d.length;
							d.splice(0, 1, d.splice(e, 1, d[0])[0]);
						}
					}
				},
				{
					content: 'function\\(d,e\\)\\{for\\(var f=64,h=\\[\\];\\+\\+f-h\\.length-32;\\)\\{switch\\(f\\)\\{[^]*?\\}h\\.push\\(String\\.fromCharCode\\(f\\)\\)\\}d\\.forEach\\(function\\(l,m,n\\)\\{this\\.push\\(n\\[m\\]=h\\[\\(h\\.indexOf\\(l\\)-h\\.indexOf\\(this\\[m\\]\\)\\+m-32\\+f--\\)%h\\.length\\]\\)\\},e\\.split\\(' + js_empty_string + '\\)\\)\\}',
					process: function(content){
						var switch_content = new RegExp('function\\(d,e\\)\\{for\\(var f=64,h=\\[\\];\\+\\+f-h\\.length-32;\\)\\{switch\\(f\\)\\{([^]*?)\\}h\\.push\\(String\\.fromCharCode\\(f\\)\\)\\}d\\.forEach\\(function\\(l,m,n\\)\\{this\\.push\\(n\\[m\\]=h\\[\\(h\\.indexOf\\(l\\)-h\\.indexOf\\(this\\[m\\]\\)\\+m-32\\+f--\\)%h\\.length\\]\\)\\},e\\.split\\(' + js_empty_string + '\\)\\)\\}').exec(content);

						return process_switch_content(switch_content && switch_content[1], true);
					}
				},
				{
					content: 'function\\(d,e\\)\\{for\\(var f=64,h=\\[\\];\\+\\+f-h\\.length-32;\\)switch\\(f\\)\\{[^]*?\\}d\\.forEach\\(function\\(l,m,n\\)\\{this\\.push\\(n\\[m\\]=h\\[\\(h\\.indexOf\\(l\\)-h\\.indexOf\\(this\\[m\\]\\)\\+m-32\\+f--\\)%h\\.length\\]\\)\\},e\\.split\\(' + js_empty_string + '\\)\\)\\}',
					process: function(content){
						var switch_content = new RegExp('function\\(d,e\\)\\{for\\(var f=64,h=\\[\\];\\+\\+f-h\\.length-32;\\)switch\\(f\\)\\{([^]*?)\\}d\\.forEach\\(function\\(l,m,n\\)\\{this\\.push\\(n\\[m\\]=h\\[\\(h\\.indexOf\\(l\\)-h\\.indexOf\\(this\\[m\\]\\)\\+m-32\\+f--\\)%h\\.length\\]\\)\\},e\\.split\\(' + js_empty_string + '\\)\\)\\}').exec(content);

						return process_switch_content(switch_content && switch_content[1], false);
					}
				},
				{
					content: 'function\\(d,e\\)\\{for\\(e=\\(e%d\\.length\\+d\\.length\\)%d\\.length;e--;\\)d\\.unshift\\(d\\.pop\\(\\)\\)\\}',
					process: function(content){
						return function(d, e){
							e = (e % d.length + d.length) % d.length;

							while(e--)
								d.unshift(d.pop());
						}
					}
				}
			];

			var c_copy = 'c\\[\\d+?\\]=c(?:;|,)';
			var action = 'c\\[\\d+?\\]\\([^]*?\\)(?:;|,)?';
			var array_elem = functions.map(a => a.content).concat(['-?[\\d]+', js_key_string, '\\r?\\n']).join('|');

			var nFunction = new RegExp('function(?: ' + js_variable + ')?\\(a\\)\\{var b=a\\.split\\(' +
										js_empty_string + '\\),c=\\[([^]*?)\\];\\r?\\n?((?:' + c_copy + ')*?)\\r?\\n?try\\{((?:' + action + ')*?)\\}catch\\(d\\)\\{return' + js_capturing_string + '\\+a\\}\\r?\\n?return b\\.join\\(' +
										js_empty_string + '\\)\\}');
			var n = nFunction.exec(body);
			var array_contents = n[1];
			var copy = n[2];
			var actions = n[3];

			var array_elements_regex = new RegExp(functions.map(a => a.content).map(a => '(' + a + ')').concat(['(-?[\\d]+)', js_capturing_key, '(\\r?\\n)']).join('|'), 'g');
			var result;

			var array = [];

			while(result = array_elements_regex.exec(array_contents)){
				for(var i = 1; i < result.length; i++){
					if(result[i] !== undefined){
						if(i <= functions.length)
							array.push({type: 'function', value: functions[i - 1].process(result[i])});
						else switch(i - functions.length){
							case 1:
								array.push({type: 'number', value: parseInt(result[i])});

								break;
							case 2:
								array.push({type: 'variable', value: result[i]});

								break;
							case 4:
							case 5:
								array.push({type: 'string', value: result[i]});

								break;
						}

						break;
					}
				}
			}

			var copy_regex = new RegExp('c\\[(\\d+?)\\]=c(?:;|,)', 'g');

			while(result = copy_regex.exec(copy)){
				array[parseInt(result[1])] = {type: 'variable', value: 'c'};
			}

			var actions_regex = new RegExp('c\\[(\\d+?)\\]\\(([^]*?)\\)(?:;|,)?', 'g');
			var actions_array = [];

			while(result = actions_regex.exec(actions)){
				let index = parseInt(result[1]);
				let args = result[2].split(',');

				args = args.map((a) => {
					var match = /c\[(\d+)\]/.exec(a);

					return parseInt(match[1]);
				});

				actions_array.push({index: index, args: args});
			}

			this.n_decode = {array, actions_array, except: n[4] || n[6]};
		}

		decode_signature(sig){
			var key, value, temp;

			sig = sig.split('');

			for(var i = 0; i < this.signature_decode.length; i++){
				key = this.signature_decode[i];

				if(key == 0){
					sig.reverse();

					continue;
				}

				value = this.signature_decode[++i];

				switch(key){
					case 1:
						temp = sig[0];

						sig[0] = sig[value];
						sig[value] = temp;

						break;
					case 2:
						sig.slice(value);

						break;
					case 3:
						sig.splice(0, value);

						break;
				}
			}

			return sig.join('');
		}

		decode_n(a){
			var b = a.split('');
			var c = new Array(this.n_decode.array.length);

			for(var i = 0; i < c.length; i++){
				if(this.n_decode.array[i].type != 'variable')
					c[i] = this.n_decode.array[i].value;
				else{
					switch(this.n_decode.array[i].value){
						case 'c':
							c[i] = c;

							break;
						case 'b':
							c[i] = b;

							break;
						case 'a':
							c[i] = a;

							break;
						case 'null':
							c[i] = null;

							break;
					}
				}
			}

			for(var {index, args} of this.n_decode.actions_array){
				try{
					c[index].apply(null, args.map(a => c[a]));
				}catch(e){
					return this.n_decode.except + a;
				}
			}

			return b.join('');
		}
	});
})();

/* manages api requests and headers to youtube.com */
const youtubeInterface = new (class{
	constructor(){
		this.data = null;
		this.player_js = null;
		this.innertube = {};
		this.cookie = '';
		this.sapisid = '';

		this.needs_reload = false;
		this.last_reload = 0;
		this.reload_interval = 24 * 60 * 60 * 1000;
	}

	async reload(force = true){
		/* has our playerjs expired? */
		if(this.data){
			if(force)
				this.needs_reload = true;
			return;
		}

		do{
			this.needs_reload = false;
			this.last_reload = Date.now();
			this.data = this.do();

			try{
				await this.data;
			}catch(e){
				this.last_reload = 0;
			}

			this.data = null;
		}while(this.needs_reload);
	}

	async fetch(){
		if(Date.now() - this.last_reload > this.reload_interval)
			this.reload();
		if(this.data)
			await this.data;
	}

	async do(){
		var {body} = await Request.get('https://www.youtube.com/', {headers: {cookie: this.cookie}});

		var state = /ytcfg\.set\((\{[\s\S]+?\})\);/.exec(body);

		if(!state)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Could not find state object'));
		try{
			state = JSON.parse(state[1]);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, new Error('Could not parse state object'));
		}

		this.signatureTimestamp = state.STS;
		this.innertube.key = state.INNERTUBE_API_KEY;
		this.innertube.context = state.INNERTUBE_CONTEXT;
		this.player_js = state.PLAYER_JS_URL;

		if(!this.signatureTimestamp || !this.innertube.key || !this.innertube.context || !this.player_js)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing state fields'));
		body = (await Request.get('https://www.youtube.com' + this.player_js)).body;
		decoder.process(body);
	}

	async makeApiRequest(path, body = {}){
		/* youtube v1 api */
		await this.fetch();

		var options = {};
		var time = Math.floor(Date.now() / 1000);

		body.context = this.innertube.context;
		options.method = 'POST';

		if(options.headers)
			options.headers = {...options.headers, cookie: this.cookie};
		else
			options.headers = {cookie: this.cookie};
		if(this.sapisid)
			options.headers.authorization = 'SAPISIDHASH ' + time + '_' + crypto.createHash('sha1').update(time + ' ' + this.sapisid + ' https://www.youtube.com').digest('hex');
		options.headers.origin = 'https://www.youtube.com';
		options.body = JSON.stringify(body);

		var {res} = await Request.getResponse('https://www.youtube.com/youtubei/v1/' + path + '?key=' + this.innertube.key, options);
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

	async makePlayerRequest(id){
		return await this.makeApiRequest('player', {videoId: id, playbackContext: {contentPlaybackContext: {signatureTimestamp: this.signatureTimestamp}}})
	}

	async setCookie(cookiestr){
		var cookies = cookiestr.split(';');
		var map = new Map();

		for(var cookie of cookies){
			cookie = cookie.trim().split('=');
			map.set(cookie[0], cookie[1]);
		}

		this.sapisid = map.get('SAPISID') || map.get('__Secure-3PAPISID') || '';
		this.cookie = cookiestr;
		this.reload();
	}
});

function getProperty(array, prop){
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

function checkPlayable(st){
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
		case 'login_required':
			throw new SourceError.UNPLAYABLE(reason || status);
	}
}

function number(n){
	n = parseInt(n, 10);

	if(Number.isFinite(n))
		return n;
	return 0;
}

function parseTimestamp(str){
	var tokens = str.split(':').map((token) => parseInt(token, 10));

	var scale = [1, 60, 3600, 86400];
	var seconds = 0;

	for(var i = tokens.length - 1; i >= 0; i--){
		if(!Number.isInteger(tokens[i]))
			return 0;
		seconds += tokens[i] * scale[Math.min(3, tokens.length - i - 1)];
	}

	return seconds;
}

class YoutubeTrack extends Track{
	constructor(){
		super('Youtube');
	}

	async getStreams(){
		return await api.getStreams(this.id);
	}

	get url(){
		return 'https://www.youtube.com/watch?v=' + this.id;
	}
}

class YoutubeResults extends TrackResults{
	setContinuation(cont){
		this.continuation = cont;
	}

	async next(){
		if(this.continuation)
			return await api.search(null, this.continuation);
		return null;
	}
}

class YoutubePlaylist extends TrackPlaylist{
	setContinuation(cont){
		this.continuation = cont;
	}

	async next(){
		if(this.continuation)
			return await api.playlistOnce(null, this.continuation);
		return null;
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
	constructor(start, playerResponse){
		super(playerResponse.videoDetails.isLive);

		var {formats, adaptiveFormats, expiresInSeconds} = playerResponse.streamingData;

		if(!this.live && formats)
			this.extractStreams(formats, false);
		if(adaptiveFormats)
			this.extractStreams(adaptiveFormats, true);
		this.expire = start + parseInt(expiresInSeconds, 10) * 1000;
	}

	expired(){
		return Date.now() > this.expire;
	}

	extractStreams(streams, adaptive){
		for(var fmt of streams){
			if(fmt.type == 'FORMAT_STREAM_TYPE_OTF')
				continue;
			var scipher = fmt.cipher || fmt.signatureCipher;
			var url = fmt.url;

			if(scipher){
				var cipher = {};
				var cipherArr = scipher.split('&');

				for(var j = 0; j < cipherArr.length; j++){
					var params = cipherArr[j].split('=');

					cipher[params[0]] = decodeURIComponent(params[1]);
				}

				url = cipher.url + '&' + cipher.sp + '=' + decoder.decode_signature(cipher.s);
			}

			url = new URL(url);
			url.searchParams.set('n', decoder.decode_n(url.searchParams.get('n')));
			url = url.toString();

			var stream = new YoutubeStream(url, fmt.itag);

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

const api = new (class{
	constructor(){}

	async get(id){
		var start;
		var responses;

		for(var tries = 0; tries < 2; tries++){
			start = Date.now();

			responses = [
				youtubeInterface.makeApiRequest('next', {videoId: id}),
				youtubeInterface.makePlayerRequest(id)
			];

			try{
				responses = await Promise.all(responses);
			}catch(e){
				if(e.code == SourceError.codes.NOT_FOUND){
					e.message = 'Video not found';

					throw e;
				}

				if(tries)
					throw e;
				youtubeInterface.reload(false);

				continue;
			}

			break;
		}

		var response = responses[0];
		var playerResponse = responses[1];

		if(!response || !playerResponse)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing data'));
		checkPlayable(playerResponse.playabilityStatus);

		var videoDetails = playerResponse.videoDetails;

		try{
			var author = getProperty(response.contents.twoColumnWatchNextResults.results.results.contents, 'videoSecondaryInfoRenderer').owner.videoOwnerRenderer;

			return new YoutubeTrack()
				.setOwner(
					text(author.title),
					TrackImage.from(author.thumbnail.thumbnails)
				).setMetadata(
					videoDetails.videoId,
					videoDetails.title,
					number(videoDetails.lengthSeconds),
					TrackImage.from(videoDetails.thumbnail.thumbnails)
				).setStreams(
					new YoutubeStreams(start, playerResponse),
					Math.min(1, Math.pow(10, (playerResponse.playerConfig.audioConfig.loudnessDb || 0) / -20))
				);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async getStreams(id){
		var start;
		var playerResponse;

		for(var tries = 0; tries < 2; tries++){
			start = Date.now();

			try{
				playerResponse = await youtubeInterface.makePlayerRequest(id);
			}catch(e){
				if(tries)
					throw e;
				youtubeInterface.reload(false);

				continue;
			}

			break;
		}

		if(!playerResponse)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing data'));
		checkPlayable(playerResponse.playabilityStatus);

		var videoDetails = playerResponse.videoDetails;

		try{
			return new YoutubeTrack()
				.setMetadata(
					videoDetails.videoId,
					videoDetails.title,
					number(videoDetails.lengthSeconds),
					TrackImage.from(videoDetails.thumbnail.thumbnails)
				).setStreams(
					new YoutubeStreams(start, playerResponse),
					Math.min(1, Math.pow(10, (playerResponse.playerConfig.audioConfig.loudnessDb || 0) / -20))
				);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async playlistOnce(id, continuation){
		var results = new YoutubePlaylist();
		var body = {};

		if(continuation)
			body.continuation = continuation;
		else
			body.browseId = 'VL' + id;
		var data = await youtubeInterface.makeApiRequest('browse', body);

		if(continuation){
			if(!data.onResponseReceivedActions)
				throw new SourceError.NOT_FOUND('Playlist continuation token not found');
			try{
				data = data.onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems;
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}
		}else{
			if(!data.sidebar)
				throw new SourceError.NOT_FOUND('Playlist not found');
			try{
				var details = getProperty(data.sidebar.playlistSidebarRenderer.items, 'playlistSidebarPrimaryInfoRenderer');

				data = data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].playlistVideoListRenderer.contents;
				results.setMetadata(text(details.title), text(details.description))
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}
		}

		try{
			for(var item of data){
				if(item.continuationItemRenderer)
					results.setContinuation(item.continuationItemRenderer.continuationEndpoint.continuationCommand.token);
				else if(item.playlistVideoRenderer){
					item = item.playlistVideoRenderer;

					results.push(new YoutubeTrack()
						.setOwner(
							text(item.shortBylineText),
							null
						).setMetadata(
							item.videoId,
							text(item.title),
							number(item.lengthSeconds),
							TrackImage.from(item.thumbnail.thumbnails)
						).setPlayable(item.isPlayable ? true : false)
					);
				}
			}

			return results;
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async playlist(id, limit){
		var list = [];
		var continuation = null;

		do{
			var result = await this.playlistOnce(id, continuation);

			list = list.concat(result);
			continuation = result.continuation;
		}while(continuation && (!limit || list.length < limit));

		return list;
	}

	async search(query, continuation){
		var body = await youtubeInterface.makeApiRequest('search', continuation ? {continuation} : {query, params: 'EgIQAQ%3D%3D'});

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
			for(var item of body){
				if(item.continuationItemRenderer)
					results.setContinuation(item.continuationItemRenderer.continuationEndpoint.continuationCommand.token);
				else if(item.itemSectionRenderer){
					var list = item.itemSectionRenderer.contents;

					for(var video of list){
						if(video.videoRenderer){
							video = video.videoRenderer;

							var thumbs;

							if(video.channelThumbnailSupportedRenderers)
								thumbs = video.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer.thumbnail.thumbnails;
							else if(video.channelThumbnail)
								thumbs = video.channelThumbnail.thumbnails;
							results.push(new YoutubeTrack()
								.setOwner(
									text(video.shortBylineText),
									TrackImage.from(thumbs)
								).setMetadata(
									video.videoId,
									text(video.title),
									video.lengthText ? parseTimestamp(video.lengthText.simpleText) : 0,
									TrackImage.from(video.thumbnail.thumbnails),
								)
							);
						}
					}
				}
			}

			return results;
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	setCookie(cookie){
		youtubeInterface.setCookie(cookie);
	}
});

module.exports = api;