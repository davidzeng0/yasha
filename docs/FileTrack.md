## FileTrack

Resolves a track from a string

### File.js

Resolve a file track

Returns a track if the string is a valid http(s) or file URL, otherwise `null`
```js
const {Source} = require('yasha');

const track1 = await Source.File.resolve('https://www.example.com/audio.mp4');

assert(track1.isLocalFile == false);

const track2 = await Source.File.resolve('file:///path/to/your/file');

assert(track2.isLocalFile == true);

```

Create a new file track

```js
const {Source} = require('yasha');

const track = new Source.File.Track('https://www.example.com/audio.mp4');
```