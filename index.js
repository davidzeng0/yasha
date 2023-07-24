module.exports = {
	api: {
		Youtube: require('./src/api/Youtube'),
		Soundcloud: require('./src/api/Soundcloud'),
		Spotify: require('./src/api/Spotify')
	},

	Source: require('./src/Source'),
	...require('./src/Track'),
	TrackPlayer: require('./src/TrackPlayer'),
	VoiceConnection: require('./src/VoiceConnection'),
	...require('./src/Error')
};