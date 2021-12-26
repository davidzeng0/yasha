## FileTrack

Resolves a track from a string

### File.js

Resolve a file track
Returns a track if the string is a valid http(s) URL, otherwise `null`
```js
const {Source} = require('yasha');

var track = await Source.File.resolve('https://www.example.com/audio.mp4');
```

Create a new file track

```js
const {Source} = require('yasha');

var track = new Source.File.Track('https://www.example.com/audio.mp4');
```