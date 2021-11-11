## VoiceConnection

Utility function for connecting to a voice channel.

### VoiceConnection.js

```js
const {VoiceConnection} = require('yasha');

VoiceConnection.connect(channel).then((connection) => {
	console.log('Connected!');
});
```

#### Functions

Connect
```js
const {VoiceChannel} = require('discord.js');

VoiceConnection.connect(channel: VoiceChannel): Promise<VoiceConnection>
```

Subscribe (see @discordjs/voice subscribe documentation)
```js
const {TrackPlayer} = require('yasha');

var player = new TrackPlayer();
var subscription = connection.subscribe(player);
```

Unubscribe
```js
subscription.unsubscribe();
```

#### Events

Disconnected (occurs when switching channels)
```js
connection.on(VoiceConnection.Status.Disconnected, () => {
	// ignore this event, as the connection may automatically re-establish a connection
});
```

Destroyed
```js
connection.on(VoiceConnection.Status.Destroyed, () => {
	// true disconnect, wont reconnect again
	console.log('Disconnected');
});
```

Error
```js
connection.on('error', (error) => {
	console.error(error);

	// also a true disconnect
	// destroy event will be emitted
});
```

Ready
```js
connection.on(VoiceConnection.Status.Ready, () => {
	console.log('Ready');
});
```

Signalling
```js
connection.on(VoiceConnection.Status.Signalling, () => {
	console.log('Requesting to establish a connection to the channel');
});
```

Connecting
```js
connection.on(VoiceConnection.Status.Connecting, () => {
	console.log('Connecting to the channel');
});
```