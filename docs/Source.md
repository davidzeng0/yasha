## Source

Resolves a track from a string

### Source.js

```js
const {Source} = require('yasha');

var track = await Source.resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
```

```js
const {Source, Track: {TrackPlaylist}} = require('yasha');

var playlist = await Source.resolve('https://www.youtube.com/playlist?list=yourPLAYLISTidHERE');

console.log(playlist instanceof TrackPlaylist); // true
```

```js
var result = await Source.resolve(input);

if(result instanceof TrackPlaylist){
	// metadata like title, description, and url are only guaranteed to be available if it's first fetch from api
	// aka offset = 0 or continuation = null or resolved from Source
	console.log(`Found playlist ${result.title} ${result.url}`);

	var first_track = result.first_track;
	var list: Track[] = [];

	if(first_track)
		list.push(first_track);
	while(result && result.length){
		if(first_track){
			for(var i = 0; i < result.length; i++){
				if(result[i].equals(first_track)){
					result.splice(i, 1);

					break;
				}
			}
		}

		list = list.concat(result);

		try{
			result = await result.next(); // next page
		}catch(e){
			console.error(e);

			throw e;
		}
	}

	console.log(`Loaded ${list.length} tracks`);
}else{
	console.log(`Found track ${result.title}`);
	console.log(result instanceof Track); // true
}
```

#### Functions

Resolve (static)
```js
const {Track: {Track, TrackPlaylist}} = require('yasha');

// attempts to resolve a url to a track or playlist
// returns null if given text does not match any urls
// for string searches use Source.[Platform].search()
Source.resolve(string: string): Promise<Track | TrackPlaylist | null>
```

Sources

Youtube
```js
const {Source: {Youtube}, Track: {TrackResults}} = require('yasha');

Youtube.search(input: string): Promise<TrackResults>

// account cookie for age verification
Youtube.setCookie(cookie: string): void
```

Soundcloud
```js
const {Source: {Soundcloud}, Track: {TrackResults}} = require('yasha');

Soundcloud.search(input: string): Promise<TrackResults>
```

Spotify
```js
const {Source: {Spotify}, Track: {TrackResults}} = require('yasha');

Spotify.search(input: string): Promise<TrackResults>
```

#### Errors

```js
class SourceError extends Error{
	code: number;
	message: string;
	details: string; // more info for debugging, not shown to user
}

const {Source} = require('yasha');

// all API and Source functions will throw SourceError and only SourceError
const SourceError = Source.Error;
```

```js
// access via SourceError.codes

enum SourceErrorCode{
	NETWORK_ERROR: 1, // see errors from fetch API
	INVALID_RESPONSE: 2, // invalid response from API (most likely replied with non-json)
	INTERNAL_ERROR: 3, // internal error
	NOT_FOUND: 4, // track not found
	UNPLAYABLE: 5 // track found but not playable
};
```

```js
try{
	await Source.Youtube.get('dQw4w9WgXcQ'); // get by video id
}catch(e){
	if(e.code == SourceError.codes.NOT_FOUND){
		console.log('Track not found');
	}else if(e.code == SourceError.codes.UNPLAYABLE){
		console.log('Track not playable');
	}else{
		console.error(e.message);
	}
}
```

### Custom Tracks
```js
class MyTrack{
	constructor(id, platform){
		this.id = id;
		this.platform = platform;
	}

	getStreams(){
		// see Track.md

		switch(this.platform){
			case 'youtube':
				return Source.Youtube.getStreams(this.id);
			case 'soundcloud':
				return Source.Soundcloud.getStreams(this.id);
			case 'spotify':
				return Source.Spotify.getStreams(this.id);
			default:
				// must not return null
				throw new Error('Unknown platform');
				// error will be emitted from TrackPlayer.on('error')
		}
	}
}
```

```js
class MyYoutubeTrack extends Source.Youtube.Track{
	constructor(id){
		super(id);
	}

	getStreams(){
		// fields required are not documented and this method isn't supported
		// see api/[source].js for what fields are required for getStreams()

		return super.getStreams();
	}
}