## TrackPlayer

Plays a track to a voice connection

### TrackPlayer.js

```js
const {TrackPlayer, VoiceConnection, Source} = require('yasha');

var player = new TrackPlayer();
var track = await Source.resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
var connection = await VoiceConnection.connect(channel);

var subscription = connection.subscribe(player);

player.play(track);
player.start();
```

#### Events

Ready

Emitted after a call to `start()`, when the player has established a connection and probed the audio format, duration, etc...
```js
player.on('ready', () => {
	console.log(`Ready! Duration: ${player.getDuration()} seconds`);
});
```

Packet (for debugging purposes)
```js
class Packet{
	frame_size: Number; // number of samples
	buffer: Buffer; // frame data
}

player.on('packet', (packet: Packet) => {
	console.log(`Packet: ${packet.frame_size} samples`);
});
```

Finish
```js
player.on('finish', () => {
	console.log('Finished playing the track');

	if(loop){
		player.seek(0);
	}else if(nextTrack){
		player.play(nextTrack);
		player.start();
	}else{
		player.cleanup(); // release the internal player and its resources
	}
});
```

Error
```js
player.on('error', (error: Error) => {
	console.log(`Error: ${error.message}`);

	// play the next track
	player.play(nextTrack);
	player.start();
});
```

#### Member Functions

Play a track
```js
const {Track: {Track}} = require('yasha');

player.play(track: Track): void;
```

Start playing
```js
player.start(): void;
```


Check if the player is paused
```js
player.isPaused(): boolean
```

Set the player's volume
```js
// 1 = 100%
// 1.5 = 150%
// 0.5 = 50%
player.setVolume(volume: Number): void
```

Set the player's bitrate
```js
//bitrate in bits/sec
player.setBitrate(bitrate: Number): void
```

Set the player's speed
```js
// 1 = normal speed
// 2 = double speed
// 0.5 = half speed
player.setRate(rate: Number): void
```

Set the player's tempo
```js
// 1 = normal tempo
// 2 = double tempo
// 0.5 = half tempo
player.setTempo(tempo: Number): void
```

Set a tremolo effect
```js
player.setTremolo(depth: Number, rate: Number): void

// stop tremolo
player.setTremolo(0, 0);
```

Set an equalizer
```js
class EqualizerSetting{
	band: Number, // Hz
	gain: Number // dB
}

player.setEqualizer(eqs: EqualizerSetting[]): void

// stop equalizer
player.setEqualizer([]);
```

Seek the player
```js
// time in seconds
player.seek(time: Number): void
```

Get player's current time
```js
// time in seconds
player.getTime(): Number
```

Get player's duration
```js
// time in seconds
player.getDuration(): Number
```

Start the player
```js
player.start(): void
```

Stop the player
```js
player.stop(): void
```

Clean up the internal player

TrackPlayer is still usable for playing new tracks
Useful for when there are no tracks in queue to play so the internal player's memory can be freed
```js
player.cleanup(): void
```

Destroy the player, unsubscribe all connections, and free internal resources
```js
player.destroy(): void
```
