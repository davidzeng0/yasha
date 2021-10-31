const fetch = require('node-fetch');

const httpsAgent = new (require('https').Agent)({keepAlive: true});
const httpAgent = new (require('http').Agent)({keepAlive: true});

module.exports = function(url, opts = {}){
	opts.agent = new URL(url).protocol == 'https:' ? httpsAgent : httpAgent;

	return fetch(url, opts);
};