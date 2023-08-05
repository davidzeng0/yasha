## index

Library exports

**Warning: Extending any of these classes is not recommended, unless you know what you're doing.**

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

	// src/Track
	Track,
	TrackResults,
	TrackPlaylist,
	TrackImage,
	TrackStream,
	TrackStreams,

	TrackPlayer, // src/TrackPlayer
	VoiceConnection, // src/VoiceConnection

	// src/Error
	UnplayableError,
	NotATrackError
} = lib;
```