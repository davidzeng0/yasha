const crypto = require('crypto');
const Request = require('../Request');
const SourceError = require('../SourceError');
const util = require('./util');

const {Track, TrackImage, TrackResults, TrackPlaylist, TrackStream, TrackStreams} = require('../Track');

var js_variable = '[\\w_\\$][\\w\\d]*';
var js_singlequote_string = '\'[^\'\\\\]*(:?\\\\[\\s\\S][^\'\\\\]*)*\'';
var js_doublequote_string = '"[^"\\\\]*(:?\\\\[\\s\\S][^"\\\\]*)*"';
var js_string = '(?:' + js_singlequote_string + '|' + js_doublequote_string + ')';
var js_key_string = '(?:' + js_variable + '|' + js_string + ')';
var js_property_string = '(?:\\.' + js_variable + '|\\[' + js_string + '\\])';
var js_empty_string = '(?:\'\'|"")';
var js_capturing_string = '(?:\'([^\'\\\\]*(:?\\\\[\\s\\S][^\'\\\\]*)*)\'|"([^"\\\\]*(:?\\\\[\\s\\S][^"\\\\]*)*)")';
var js_capturing_key = '(' + js_variable + ')|' + js_capturing_string;

var signature_function_ids = {
	reverse: 0,
	slice: 1,
	splice: 2,
	swap: 3
};

var signature_functions = [
	{
		name: 'reverse',
		id: signature_function_ids.reverse,
		content: ':function\\(a\\)\\{(?:return )?a\\.reverse\\(\\)\\}'
	},
	{
		name: 'slice',
		id: signature_function_ids.slice,
		content: ':function\\(a,b\\)\\{return a\\.slice\\(b\\)\\}'
	},
	{
		name: 'splice',
		id: signature_function_ids.splice,
		content: ':function\\(a,b\\)\\{a\\.splice\\(0,b\\)\\}'
	},
	{
		name: 'swap',
		id: signature_function_ids.swap,
		content: ':function\\(a,b\\)\\{var c=a\\[0\\];a\\[0\\]=a\\[b(?:%a\\.length)\\];a\\[b(?:%a\\.length)?\\]=c(?:;return a)?\\}'
	}
];

var signature_function_definitions = 'var (' + js_variable + ')=\\{((?:(?:' + signature_functions.map((f) => js_key_string + f.content).join('|') + '),?\\r?\\n?)+)\\};';
var signature_function_execs = 'function(?: ' + js_variable + ')?\\(a\\)\\{a=a\\.split\\(' + js_empty_string + '\\);\\s*((?:(?:a=)?' + js_variable + js_property_string + '\\(a,\\d+\\);)*)return a\\.join\\(' + js_empty_string + '\\)\\}';

var n_functions = [
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

			return process_switch_content(switch_content && switch_content[1], true, false);
		}
	},
	{
		content: 'function\\(d,e\\)\\{for\\(var f=64,h=\\[\\];\\+\\+f-h\\.length-32;\\)switch\\(f\\)\\{[^]*?\\}d\\.forEach\\(function\\(l,m,n\\)\\{this\\.push\\(n\\[m\\]=h\\[\\(h\\.indexOf\\(l\\)-h\\.indexOf\\(this\\[m\\]\\)\\+m-32\\+f--\\)%h\\.length\\]\\)\\},e\\.split\\(' + js_empty_string + '\\)\\)\\}',
		process: function(content){
			var switch_content = new RegExp('function\\(d,e\\)\\{for\\(var f=64,h=\\[\\];\\+\\+f-h\\.length-32;\\)switch\\(f\\)\\{([^]*?)\\}d\\.forEach\\(function\\(l,m,n\\)\\{this\\.push\\(n\\[m\\]=h\\[\\(h\\.indexOf\\(l\\)-h\\.indexOf\\(this\\[m\\]\\)\\+m-32\\+f--\\)%h\\.length\\]\\)\\},e\\.split\\(' + js_empty_string + '\\)\\)\\}').exec(content);

			return process_switch_content(switch_content && switch_content[1], false, false);
		}
	},
	{
		content: 'function\\(\\)\\{for\\(var d=64,e=\\[\\];\\+\\+d-e\\.length-32;\\)\\{switch\\(d\\)\\{[^]*?\\}e\\.push\\(String\\.fromCharCode\\(d\\)\\)\\}return e\\}',
		process: function(content){
			var switch_content = new RegExp('function\\(\\)\\{for\\(var d=64,e=\\[\\];\\+\\+d-e\\.length-32;\\)\\{switch\\(d\\)\\{([^]*?)\\}e\\.push\\(String\\.fromCharCode\\(d\\)\\)\\}return e\\}').exec(content);

			return process_switch_content(switch_content && switch_content[1], true, true);
		}
	},
	{
		content: 'function\\(\\)\\{for\\(var d=64,e=\\[\\];\\+\\+d-e\\.length-32;\\)switch\\(d\\)\\{[^]*?\\}return e\\}',
		process: function(content){
			var switch_content = new RegExp('function\\(\\)\\{for\\(var d=64,e=\\[\\];\\+\\+d-e\\.length-32;\\)switch\\(d\\)\\{([^]*?)\\}return e\\}').exec(content);

			return process_switch_content(switch_content && switch_content[1], false, true);
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
	},
	{
		content: 'function\\(d,e,f\\)\\{var h=f\\.length;d\\.forEach\\(function\\(l,m,n\\)\\{this\\.push\\(n\\[m\\]=f\\[\\(f\\.indexOf\\(l\\)-f\\.indexOf\\(this\\[m\\]\\)\\+m\\+h--\\)%f\\.length\\]\\)\\},e\\.split\\(' + js_empty_string + '\\)\\)\\}',
		process: function(content){
			return function(d, e, f){
				var h = f.length;

				d.forEach(function(l, m, n){
					this.push(n[m] = f[(f.indexOf(l) - f.indexOf(this[m]) + m + h--) % f.length]);
				}, e.split(''));
			}
		}
	}
];

var n_c_copy = 'c\\[(\\d+?)\\]=c(?:;|,)';
var n_action = 'c\\[(\\d+?)\\]\\(([^]*?)\\)(?:;|,)?';

var n_match = 'function(?: ' + js_variable + ')?\\(a\\)\\{var b=a\\.split\\(' + js_empty_string + '\\),c=\\[([^]*?)\\];\\r?\\n?((?:' + n_c_copy + ')*?)\\r?\\n?try\\{((?:' + n_action + ')*?)\\}catch\\(d\\)\\{return' + js_capturing_string + '\\+a\\}\\r?\\n?return b\\.join\\(' + js_empty_string + '\\)\\}';
var n_array_elements = n_functions.map(a => a.content).map(a => '(' + a + ')').concat(['(-?[\\d]+)', js_capturing_key, '(\\r?\\n)']).join('|');

var switch_code = [
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
		content: 'd-=\\d+?;|d+=\\d+?;|d=\\d+;?',
		process: function(content){
			content = /d(-=|\+=|=)(\d+);?/.exec(content);

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
		content: 'h\\.push\\(String\\.fromCharCode\\(f\\)\\);?|e\\.push\\(String\\.fromCharCode\\(d\\)\\);?',
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

var switch_code_regex = switch_code.map((c => '(' + c.content + ')')).join('|');

function process_switch_content(switch_content, def, array){
	var content = [];
	var default_index = -1;

	if(switch_content){
		var content_regex = new RegExp(switch_code_regex, 'g');
		var result;

		while(result = content_regex.exec(switch_content)){
			for(var i = 1; i < result.length; i++){
				if(result[i] === undefined)
					continue;
				var c = switch_code[i - 1].process(result[i]);

				c.index = i - 1;
				content.push(c);

				if(c.type == 'default')
					default_index = content.length;
				break;
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
					f = switch_code[content[i].index].do(f, h, content[i].value);
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
					f = switch_code[content[i].index].do(f, h, content[i].value);
				}
			}
		}

		if(def){
			if(case_continue)
				continue;
			h.push(String.fromCharCode(f));
		}
	}

	if(array)
		return function(){
			return h;
		}
	return function(d, e){
		var k = f;

		d.forEach(function(l, m, n){
			this.push(n[m] = h[(h.indexOf(l) - h.indexOf(this[m]) + m - 32 + k--) % h.length]);
		}, e.split(''));
	}
}

/* decodes signatures and n */
var decoder = new class YoutubeDecoder{
	constructor(){
		this.signature_decode = [];
		this.n_decode = {};
	}

	process(body){
		this.signature_decode = [];
		this.n_decode = {};

		this.get_signature_decode(body);

		try{
			this.get_n_decode(body);
		}catch(e){
			this.n_decode.error = e;
		}
	}

	get_signature_decode(body){
		var function_defs = new RegExp(signature_function_definitions),
			function_execs = new RegExp(signature_function_execs);
		function_defs = function_defs.exec(body);
		function_execs = function_execs.exec(body);

		var obj = function_defs[1], obj_body = function_defs[2], func_body = function_execs[1];

		for(var i = 0; i < signature_functions.length; i++){
			var match = new RegExp('(' + js_key_string + ')' + signature_functions[i].content, 'g');
			var result = match.exec(obj_body);

			if(result)
				signature_functions[i].key = result[1];
			else
				signature_functions[i].key = '';
		}

		var keys = '(' + signature_functions.map((f) => f.key).join('|') + ')',
			action_regex = new RegExp('(?:a=)?' + obj + '(?:\\.' + keys + '|\\[\'' + keys + '\'\\]|\\["' + keys + '"\\])\\(a,(\\d+)\\)', 'g');
		var result;

		while(result = action_regex.exec(func_body)){
			var key = result[1] || result[2] || result[3],
				val = result[4];
			for(var i = 0; i < signature_functions.length; i++){
				if(key == signature_functions[i].key){
					this.signature_decode.push(i);

					if(i != signature_function_ids.reverse)
						this.signature_decode.push(parseInt(val, 10));
					break;
				}
			}
		}
	}

	get_n_decode(body){
		var n = new RegExp(n_match).exec(body);

		var array_contents = n[1],
			copy = n[2],
			actions = n[4],
			except = util.deepclone(n[7] || n[9]),
			array = [],
			actions_array = [],
			result;
		var array_elements_regex = new RegExp(n_array_elements, 'g'),
			copy_regex = new RegExp(n_c_copy, 'g'),
			actions_regex = new RegExp(n_action, 'g');
		var result;

		while(result = array_elements_regex.exec(array_contents)){
			for(var i = 1; i < result.length; i++){
				if(result[i] === undefined)
					continue;
				if(i <= n_functions.length)
					array.push({type: 'function', value: n_functions[i - 1].process(result[i])});
				else switch(i - n_functions.length){
					case 1:
						array.push({type: 'number', value: parseInt(result[i])});

						break;
					case 2:
						array.push({type: 'variable', value: result[i]});

						if(result[i] != 'a' && result[i] != 'b' && result[i] != 'c' && result[i] != 'null')
							throw new Error('Unknown variable: ' + result[i]);
						break;
					case 4:
					case 5:
						array.push({type: 'string', value: result[i]});

						break;
				}

				break;
			}
		}

		while(result = copy_regex.exec(copy)){
			array[parseInt(result[1])] = {type: 'variable', value: 'c'};
		}

		while(result = actions_regex.exec(actions)){
			var index = parseInt(result[1]),
				args = result[2].split(',');
			args = args.map((a) => {
				var match = /c\[(\d+)\](\()?/.exec(a);

				return {index: parseInt(match[1]), call: match[2] ? true : false};
			});

			actions_array.push({index: index, args: args});
		}

		this.n_decode = {array, actions_array, except};
	}

	decode_signature(sig){
		var key, value, temp;

		sig = sig.split('');

		for(var i = 0; i < this.signature_decode.length; i++){
			key = this.signature_decode[i];

			if(key == signature_function_ids.reverse){
				sig.reverse();

				continue;
			}

			value = this.signature_decode[++i];

			switch(key){
				case signature_function_ids.slice:
					sig.slice(value);

					break;
				case signature_function_ids.splice:
					sig.splice(0, value);

					break;
				case signature_function_ids.swap:
					temp = sig[0];

					sig[0] = sig[value];
					sig[value] = temp;

					break;
			}
		}

		return sig.join('');
	}

	decode_n(a){
		if(this.n_decode.error)
			throw this.n_decode.error;
		var b = a.split(''),
			c = new Array(this.n_decode.array.length);
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
				c[index].apply(null, args.map(({index, call}) => call ? c[index]() : c[index]));
			}catch(e){
				return this.n_decode.except + a;
			}
		}

		return b.join('');
	}
}

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
	set_continuation(cont){
		this.continuation = cont;
	}

	process(id, data){
		this.id = id;

		for(var item of data){
			if(item.continuationItemRenderer)
				this.set_continuation(item.continuationItemRenderer.continuationEndpoint.continuationCommand.token);
			else if(item.playlistVideoRenderer)
				this.push(new YoutubeTrack().from_playlist(item.playlistVideoRenderer));
		}
	}

	async next(){
		if(this.continuation)
			return await api.playlist_once(null, this.continuation);
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
	constructor(start, playerResponse){
		super(Math.min(1, Math.pow(10, (playerResponse.playerConfig.audioConfig.loudnessDb || 0) / -20)), playerResponse.videoDetails.isLive, start);

		var {formats, adaptiveFormats, expiresInSeconds} = playerResponse.streamingData;

		if(!this.live && formats)
			this.extract_streams(formats, false);
		if(adaptiveFormats)
			this.extract_streams(adaptiveFormats, true);
		this.expire = start + parseInt(expiresInSeconds, 10) * 1000;
	}

	expired(){
		return Date.now() > this.expire;
	}

	extract_streams(streams, adaptive){
		for(var fmt of streams){
			if(fmt.type == 'FORMAT_STREAM_TYPE_OTF')
				continue;
			var scipher = fmt.cipher || fmt.signatureCipher;
			var url = fmt.url;

			if(scipher){
				var cipher = {};
				var cipher_contents = scipher.split('&');

				for(var j = 0; j < cipher_contents.length; j++){
					var params = cipher_contents[j].split('=');

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

/* api requests and headers to youtube.com */
const api = new class YoutubeAPI{
	constructor(){
		this.player_js = null;
		this.innertube_context = null;
		this.innertube_key = null;
		this.signature_timestamp = 0;

		this.cookie = '';
		this.sapisid = '';

		this.reloading = null;
		this.needs_reload = false;
		this.last_reload = 0;
		this.reload_interval = 24 * 60 * 60 * 1000;
	}

	async reload(force){
		/* has our playerjs expired? */
		if(this.reloading){
			if(force)
				this.needs_reload = true;
			return;
		}

		do{
			this.needs_reload = false;
			this.last_reload = Date.now();
			this.reloading = this.load();

			try{
				await this.reloading;
			}catch(e){
				this.last_reload = 0;
			}

			this.reloading = null;
		}while(this.needs_reload);
	}

	async load(){
		var {body} = await Request.get('https://www.youtube.com/');

		var state = /ytcfg\.set\((\{[^]+?\})\);/.exec(body);

		if(!state)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Could not find state object'));
		try{
			state = JSON.parse(state[1]);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, new Error('Could not parse state object'));
		}

		this.signature_timestamp = state.STS;
		this.innertube_key = state.INNERTUBE_API_KEY;
		this.innertube_context = state.INNERTUBE_CONTEXT;
		this.player_js = state.PLAYER_JS_URL;

		if(!this.signature_timestamp || !this.innertube_key || !this.innertube_context || !this.player_js)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing state fields'));
		body = (await Request.get('https://www.youtube.com' + this.player_js)).body;
		decoder.process(body);
	}

	async prefetch(now = Date.now()){
		if(now - this.last_reload > this.reload_interval)
			this.reload();
		if(this.reloading)
			await this.reloading;
	}

	async api_request(path, body = {}, query = '', origin = 'www'){
		/* youtube v1 api */
		var time = Date.now();
		var options = {};

		await this.prefetch(time);

		body.context = this.innertube_context;
		options.method = 'POST';

		if(!options.headers)
			options.headers = {};
		options.headers.origin = `https://${origin}.youtube.com`;

		if(this.sapisid){
			var hash;

			time = Math.floor(time / 1000);
			hash = crypto.createHash('sha1').update(`${time} ${this.sapisid} https://www.youtube.com`).digest('hex');

			options.headers.authorization = 'SAPISIDHASH ' + time + '_' + hash;
			options.headers.cookie = this.cookie;
		}

		options.body = JSON.stringify(body);

		var {res} = await Request.getResponse(`https://${origin}.youtube.com/youtubei/v1/${path}?key=${this.innertube_key}${query}`, options);
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

	async player_request(id){
		return await this.api_request('player', {videoId: id, playbackContext: {contentPlaybackContext: {signatureTimestamp: this.signature_timestamp}}})
	}

	async get(id){
		var start;
		var responses;

		for(var tries = 0; tries < 2; tries++){
			start = Date.now();

			responses = [
				this.api_request('next', {videoId: id}),
				this.player_request(id)
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
				this.reload();

				continue;
			}

			break;
		}

		var response = responses[0];
		var player_response = responses[1];

		if(!response || !player_response)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing data'));
		check_playable(player_response.playabilityStatus);

		var video_details = player_response.videoDetails;

		try{
			var author = get_property(response.contents.twoColumnWatchNextResults.results.results.contents, 'videoSecondaryInfoRenderer').owner.videoOwnerRenderer;

			return new YoutubeTrack().from(video_details, author, new YoutubeStreams(start, player_response));
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async get_streams(id){
		var start;
		var player_response;

		for(var tries = 0; tries < 2; tries++){
			start = Date.now();

			try{
				player_response = await this.player_request(id);
			}catch(e){
				if(tries)
					throw e;
				this.reload();

				continue;
			}

			break;
		}

		if(!player_response)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing data'));
		check_playable(player_response.playabilityStatus);

		try{
			return new YoutubeStreams(start, player_response);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async playlist_once(id, continuation){
		var results = new YoutubePlaylist();
		var body = {};

		if(continuation)
			body.continuation = continuation;
		else
			body.browseId = 'VL' + id;
		var data = await this.api_request('browse', body);

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
				var details = get_property(data.sidebar.playlistSidebarRenderer.items, 'playlistSidebarPrimaryInfoRenderer');

				data = data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].playlistVideoListRenderer.contents;
				results.setMetadata(text(details.title), text(details.description))
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}
		}

		try{
			results.process(id, data);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}

		return results;
	}

	async playlist(id, limit){
		var list = [];
		var continuation = null;

		do{
			var result = await this.playlist_once(id, continuation);

			list = list.concat(result);
			continuation = result.continuation;
		}while(continuation && (!limit || list.length < limit));

		return list;
	}

	async search(query, continuation){
		var body = await this.api_request('search', continuation ? {continuation} : {query, params: 'EgIQAQ%3D%3D'});

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
		var cookies = cookiestr.split(';');
		var sapisid = null;

		for(var cookie of cookies){
			cookie = cookie.trim().split('=');

			if(cookie[0] == 'SAPISID'){
				sapisid = cookie[1];

				break;
			}else if(cookie[0] == '__Secure-3PAPISID'){
				sapisid = cookie[1];
			}
		}

		this.sapisid = sapisid;
		this.cookie = cookiestr;
		this.reload(true);
	}
}

class YoutubeMusicTrack extends YoutubeTrack{
	constructor(){
		super('Youtube');
	}

	from_search(track){
		var title = track.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text;
		var metadata = track.flexColumns[1].musicResponsiveListItemFlexColumnRenderer.text;

		var owner = metadata.runs[0];
		var duration = metadata.runs.length > 1 ? parse_timestamp(metadata.runs[metadata.runs.length - 1].text) : -1;

		return this.setOwner(
			owner.text,
			null
		).setMetadata(
			track.playlistItemData.videoId,
			text(title),
			duration,
			TrackImage.from(track.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails),
		);
	}
}

class YoutubeMusicResults extends TrackResults{
	process(body){
		this.extract_tracks(body.contents);

		if(body.continuations && body.continuations.length)
			this.set_continuation(body.continuations[0].nextContinuationData.continuation);
	}

	extract_tracks(list){
		for(var video of list)
			if(video.musicResponsiveListItemRenderer)
				this.push(new YoutubeMusicTrack().from_search(video.musicResponsiveListItemRenderer));
	}

	set_continuation(cont){
		this.continuation = cont;
	}

	async next(){
		if(this.continuation)
			return await music.search(null, this.continuation);
		return null;
	}
}

var music = new class YoutubeMusic{
	constructor(){
		this.innertube_context = null;
		this.innertube_key = null;

		this.reloading = null;
		this.needs_reload = false;
		this.last_reload = 0;
		this.reload_interval = 24 * 60 * 60 * 1000;
	}

	async reload(force){
		/* has our playerjs expired? */
		if(this.reloading){
			if(force)
				this.needs_reload = true;
			return;
		}

		do{
			this.needs_reload = false;
			this.last_reload = Date.now();
			this.reloading = this.load();

			try{
				await this.reloading;
			}catch(e){
				this.last_reload = 0;
			}

			this.reloading = null;
		}while(this.needs_reload);
	}

	async load(){
		var {body} = await Request.get('https://music.youtube.com/', {headers: {'user-agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36'}});

		var state = /ytcfg\.set\((\{[^]+?\})\);/.exec(body);

		if(!state)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Could not find state object'));
		try{
			state = JSON.parse(state[1]);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, new Error('Could not parse state object'));
		}

		this.innertube_key = state.INNERTUBE_API_KEY;
		this.innertube_context = state.INNERTUBE_CONTEXT;

		if(!this.innertube_key || !this.innertube_context)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing state fields'));
	}

	get cookie(){
		return api.cookie;
	}

	get sapisid(){
		return api.sapisid;
	}

	async prefetch(now = Date.now()){
		if(now - this.last_reload > this.reload_interval)
			this.reload();
		if(this.reloading)
			await this.reloading;
	}

	async api_request(path, body, query){
		return api.api_request.call(this, path, body, query, 'music');
	}

	async search(search, continuation){
		var query, body;

		if(continuation)
			query = '&continuation=' + continuation + '&type=next';
		else
			body = {query: search, params: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D'};
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
				body = body.contents.tabbedSearchResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].musicShelfRenderer;
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}
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