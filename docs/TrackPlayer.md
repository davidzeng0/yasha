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

Options
```js
class TrackPlayerOptions{
	normalize_volume: boolean // On track streams that have a volume parameter, automatically set the volume to that

	external_encrypt: boolean // Use native code to encrypt audio packets before sending them to the voice connection. Only allows one voice connection subscription at a time.

	external_packet_send: boolean // Use native code to send audio packets to the voice connection. external_encrypt must be enabled
}

var player = new TrackPlayer(new TrackPlayerOptions());
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

player.on('packet', (buffer: Buffer, frame_size: number) => {
	console.log(`Packet: ${frame_size} samples`);
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
	console.log(`Error playing the track: ${error.message}`);

	if(nextTrack){
		// continue to the next track
		player.play(nextTrack);
		player.start();
	}else{
		player.cleanup(); // release the internal player and its resources
	}
});
```

#### Member Functions

Play a track
```js
const {Track} = require('yasha');

player.play(track: Track): void;
```

Start playing
```js
player.start(): void;
```
Has player

TrackPlayer creates an internal player each time a new track is played and destroys it upon a call to cleanup() or a call to destroy().

This function returns true if the player has a non-destroyed internal player.

If this function returns true, functions such as setVolume, isPaused, isCodecCopy, etc... can be used.
```js
player.hasPlayer(): boolean;
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

Starting the player again will restart from the very beginning and re-read stream metadata
```js
player.stop(): void
```

IsCodecCopy

Is true if the player is using minimal CPU by piping the source audio

Is false if the source codec does not match the output codec or filters are on
```js
player.isCodecCopy(): boolean
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
