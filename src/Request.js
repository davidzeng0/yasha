const {NetworkError, InternalError, ParseError} = require('js-common');

const httpsAgent = new (require('https').Agent)({keepAlive: true});
const nfetch = require('node-fetch');

async function fetch(url, opts = {}){
	opts.agent = httpsAgent;

	return nfetch(url, opts);
}

module.exports = new class{
	async getResponse(url, options){
		var res;

		try{
			res = await fetch(url, options);
		}catch(e){
			throw new NetworkError(e);
		}

		return {res};
	}

	async get(url, options){
		const {res} = await this.getResponse(url, options);

		var body;

		try{
			body = await res.text();
		}catch(e){
			if(!res.ok)
				throw new InternalError(e);
			throw new NetworkError(e);
		}

		if(!res.ok)
			throw new InternalError(body);
		return {res, body};
	}

	async getJSON(url, options){
		const data = await this.get(url, options);

		try{
			data.body = JSON.parse(data.body);
		}catch(e){
			throw new ParseError(e);
		}

		return data;
	}

	async getBuffer(url, options){
		const {res} = await this.getResponse(url, options);

		var body;

		try{
			body = await res.buffer();
		}catch(e){
			if(!res.ok)
				throw new InternalError(e);
			throw new NetworkError(e);
		}

		if(!res.ok)
			throw new InternalError(body.toString('utf8'));
		return {res, body};
	}
};