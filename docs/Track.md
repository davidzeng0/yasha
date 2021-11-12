## Track

Represents a track or a list of tracks

### Track.js

```js
const {Track: {Track, TrackPlaylist, TrackResults, TrackImage}} = require('yasha');
```

```js
class Track{
	platform: string; // Youtube, Spotify, Soundcloud
	playable: boolean;

	owner_name: string | null; // Artist name
	icons: TrackImage[] | null; // Artist icons

	id: string | null; // Track id
	title: string | null; // Track title
	duration: Number; // Track duration in seconds
	thumbnails: TrackImage[] | null; // Track thumbnails

	streams: TrackStreams | null; // Track streams

	async getStreams(): Promise<TrackStreams>; // resolve streams

	get url(): string | null; // url to track

	equals(other: Track): boolean; // whether two tracks are equal
}

class TrackStreams extends Array{
	volume: number; // the volume this track should be played at
}

class TrackResults extends Array{
	async next(): Promise<TrackResults | null>; // get next page of results
}

class TrackPlaylist extends TrackResults{
	title: string; // playlist title
	description: string; // playlist description
	first_track: Track; // if a playlist and track are queried at the same time, this is the track

	get url(): string | null; // url to playlist

	// metadata like title, description, and url are only guaranteed to be available if it's first fetch from api
	// aka offset = 0 or continuation = null

	async next(): Promise<TrackPlaylist | null>; // get next page of results
}

class TrackImage{
	url: string | null; // image url
	width: Number; // image width
	height: Number; // image height
}
```