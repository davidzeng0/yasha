## Track

Represents a track or a list of tracks

### Track.js

```js
const {Track: {Track, TrackPlaylist, TrackResults, TrackImage}} = require('yasha');
```

```js
class Track{
	platform: String; // Youtube, Spotify, Soundcloud
	playable: boolean;

	owner_name: String; // Artist name
	icons: TrackImage[]; // Artist icons

	id: String; // Track id
	title: String; // Track title
	duration: Number; // Track duration in seconds
	thumbnails: TrackImage[]; // Track thumbnails

	streams: TrackStreams[]; // Track streams
	volume: Number; // Recommended track volume

	async getStreams(): Promise<Track>; // resolve streams

	get url(): String; // url to track

	equals(other: Track): boolean; // whether two tracks are equal
}

class TrackResults extends Array{
	async next(): Promise<TrackResults>; // get next page of results
}

class TrackPlaylist extends TrackResults{
	title: String; // playlist title
	description: String; // playlist description
	first_track: Track; // if a playlist and track are queried at the same time, this is the track

	async next(): Promise<TrackPlaylist>; // get next page of results
}

class TrackImage{
	url: String; // image url
	width: Number; // image width
	height: Number; // image height
}
```