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
	console.log(`Found playlist ${result.title}`);

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