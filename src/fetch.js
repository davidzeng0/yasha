const fetch = import('node-fetch');

const httpsAgent = new (require('https').Agent)({keepAlive: true});
const httpAgent = new (require('http').Agent)({keepAlive: true});

module.exports = async function(url, opts = {}){
	opts.agent = new URL(url).protocol == 'https:' ? httpsAgent : httpAgent;

	return (await fetch).default(url, opts);
};