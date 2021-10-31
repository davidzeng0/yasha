## index

Library exports

### index.js

```js
const lib = require('yasha');

const {
	api: {
		Youtube, // src/api/Youtube
		Soundcloud, // src/api/Soundcloud
		Spotify // src/api/Spotify
	},

	Source, // src/Source
	Track: {  // src/Track
		Track,
		TrackResults,
		TrackPlaylist,
		TrackImage,
		TrackStream,
		TrackStreams
	},

	TrackPlayer, // src/TrackPlayer
	VoiceConnection, // src/VoiceConnection
} = lib;
```