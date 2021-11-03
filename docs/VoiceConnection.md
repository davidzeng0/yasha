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
const {VoiceConnectionStatus} = require('@discordjs/voice');

connection.on(VoiceConnectionStatus.Disconnected, () => {
	// ignore this event, as the connection may automatically re-establish a connection
});
```

Destroyed
```js
const {VoiceConnectionStatus} = require('@discordjs/voice');

connection.on(VoiceConnectionStatus.Destroyed, () => {
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
const {VoiceConnectionStatus} = require('@discordjs/voice');

connection.on(VoiceConnectionStatus.Ready, () => {
	console.log('Ready');
});
```

Signalling
```js
const {VoiceConnectionStatus} = require('@discordjs/voice');

connection.on(VoiceConnectionStatus.Signalling, () => {
	console.log('Negotiating a connection to a channel');
});
```

Connecting
```js
const {VoiceConnectionStatus} = require('@discordjs/voice');

connection.on(VoiceConnectionStatus.Connecting, () => {
	console.log('Connecting to the channel');
});
```