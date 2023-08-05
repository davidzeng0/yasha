## Source

Resolves a track from a string

### Source.js

```js
const {Source} = require('yasha');

var track = await Source.resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
```

```js
const {Source, TrackPlaylist} = require('yasha');

var playlist = await Source.resolve('https://www.youtube.com/playlist?list=yourPLAYLISTidHERE');

console.log(playlist instanceof TrackPlaylist); // true
```

```js
var result = await Source.resolve(input);

if(result instanceof TrackPlaylist){
	var list = await result.load();

	console.log(`Loaded ${list.length} tracks`);

	// --- manual loading ---
	// metadata like title, description, and url are only guaranteed to be available if it's first fetch from api
	// aka offset = 0 or continuation = null or resolved from Source
	console.log(`Found playlist ${result.title} ${result.url}`);

	var first_track = result.firstTrack;
	var list: Track[] = [];

	if(first_track)
		list.push(first_track);
	while(result && result.length){
		if(first_track){
			for(var i = 0; i < result.length; i++){
				if(result[i].equals(first_track)){
					result.splice(i, 1);
					first_track = null;

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
const {Track, TrackPlaylist} = require('yasha');

// attempts to resolve a url to a track or playlist
// returns null if given text does not match any urls
// for string searches use Source.[Platform].search()
Source.resolve(string: string): Promise<Track | TrackPlaylist | null>
```

Sources

Youtube
```js
const {Source: {Youtube}, TrackResults} = require('yasha');

Youtube.search(input: string): Promise<TrackResults>

// account cookie for age verification
// Example form: "__Secure-3PSID=SECRET1; __Secure-3PAPISID=SECRET2"
// To get the secrets, go to youtube, press F12 to go to dev tools,
// click Application on Chrome or Storage on Firefox, go to Cookies, https://www.youtube.com,
// then go to both __Secure-3PSID and __Secure-3PAPISID, and copy the values.
// Replace corresponding values in the example form with the respective values.
Youtube.setCookie(cookie: string): void
```

Soundcloud
```js
const {Source: {Soundcloud}, TrackResults} = require('yasha');

Soundcloud.search(input: string): Promise<TrackResults>
```

Spotify
```js
const {Source: {Spotify}, TrackResults} = require('yasha');

Spotify.search(input: string): Promise<TrackResults>
```

#### Errors (see [errors](https://github.com/davidzeng0/js-common/blob/main/src/error.ts))

```js
class GenericError extends Error{
	message: string;
	simpleMessage: string;

	userFriendlyMessage(): string; // show this to the user
}

class NetworkError extends GenericError; // network error
class ParseError extends GenericError; // error parsing server response
class NotFoundError extends GenericError; // track not found
class UnplayableError extends GenericError; // track not playable
class NotATrackError extends GenericError; // url does not lead to a track

const {Source} = require('yasha');
```

```js
try{
	await Source.Youtube.get('dQw4w9WgXcQ'); // get by video id
}catch(e){
	if(e instanceof NotFoundError){
		console.log('Track not found');
	}else if(e instanceof UnplayableError){
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

	getStreams(): Promise<TrackStreams>{
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
				throw new GenericError('Unknown platform');
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

	getStreams(): Promise<TrackStreams>{
		// fields required are not documented and this method isn't supported
		// see api/[source].js for what fields are required for getStreams()

		return super.getStreams();
	}
}
```

Playing

```js
// TrackPlayer only cares about track.streams and track.getStreams()

class PlayableTrack{ // playable by TrackPlayer
	streams: TrackStreams = null;

	getStreams(): Promise<TrackStreams>{
		// ...
	}
}

TrackPlayer.play(new MyYoutubeTrack(...));
TrackPlayer.play(new MyTrack(...));
```
