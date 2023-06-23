const SourceError = require('./SourceError');

const httpsAgent = new (require('https').Agent)({keepAlive: true});
const nfetch = require('node-fetch');

async function fetch(url, opts = {}){
	opts.agent = httpsAgent;

	return nfetch(url, opts);
}

module.exports = new class{
	async getResponse(url, options){
		let res;

		try{
			res = await fetch(url, options);
		}catch(e){
			throw new SourceError.NETWORK_ERROR(null, e);
		}

		return {res};
	}

	async get(url, options){
		const {res} = await this.getResponse(url, options);

		let body;

		try{
			body = await res.text();
		}catch(e){
			if(!res.ok)
				throw new SourceError.INTERNAL_ERROR(null, e);
			throw new SourceError.NETWORK_ERROR(null, e);
		}

		if(!res.ok)
			throw new SourceError.INTERNAL_ERROR(null, new Error(body));
		return {res, body};
	}

	async getJSON(url, options){
		const data = await this.get(url, options);

		try{
			data.body = JSON.parse(data.body);
		}catch(e){
			throw new SourceError.INVALID_RESPONSE(null, e);
		}

		return data;
	}

	async getBuffer(url, options){
		const {res} = await this.getResponse(url, options);

		let body;

		try{
			body = await res.buffer();
		}catch(e){
			if(!res.ok)
				throw new SourceError.INTERNAL_ERROR(null, e);
			throw new SourceError.NETWORK_ERROR(null, e);
		}

		if(!res.ok)
			throw new SourceError.INTERNAL_ERROR(null, new Error(body.toString('utf8')));
		return {res, body};
	}
};