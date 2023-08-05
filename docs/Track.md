## Track

Represents a track or a list of tracks

### Track.js

```js
const {Track, TrackPlaylist, TrackResults, TrackImage} = require('yasha');
```

```js
class Track{
	platform: string; // Youtube, Spotify, Soundcloud
	playable: boolean;

	author: string | null; // Artist name
	icons: TrackImage[] | null; // Artist icons

	id: string | null; // Track id
	title: string | null; // Track title
	duration: Number; // Track duration in seconds
	thumbnails: TrackImage[] | null; // Track thumbnails

	streams: TrackStreams | null; // Track streams

	async getStreams(): Promise<TrackStreams>; // resolve streams

	async fetch(): Promise<Track>; // re-fetch the track

	get url(): string | null; // url to track

	equals(other: Track): boolean; // whether two tracks are equal
}

class TrackStream{
	url: string | null; // url to stream
	video: boolean; // whether the stream has a video track
	audio: boolean; // whether the stream has an audio track
	bitrate: number; // stream bitrate (-1 if unknown)
	duration: number; // stream duration in seconds (-1 if unknown)
	container: string; // stream container (mp4, webm, ogg)
	codecs: string; // stream codecs (opus, aac aka mp4a.40.2, mp3 aka mpeg)

	getUrl(): Promise<string>; // if stream.url is null, extra steps are required to resolve the stream url. this function returns the resolved url
}

class TrackStreams extends Array{
	volume: number; // the volume this track should be played at
	live: boolean; // whether this track is live

	expired(): boolean; // returns true if it is known that the streams expired
	maybeExpired(): boolean; // unused
}

class TrackResults extends Array{
	async next(): Promise<TrackResults | null>; // get next page of results
}

class TrackPlaylist extends TrackResults{
	title: string | null; // playlist title
	description: string | null; // playlist description
	firstTrack: Track | null; // if a playlist and track are queried at the same time, this is the track

	get url(): string | null; // url to playlist

	// metadata like title, description, and url are only guaranteed to be available if it's first fetch from api
	// aka offset = 0 or continuation = null

	async load(): Promise<TrackPlaylist>; // load the rest of the playlist

	async next(): Promise<TrackPlaylist | null>; // get next page of results
}

class TrackImage{
	url: string | null; // image url
	width: Number; // image width
	height: Number; // image height
}
```