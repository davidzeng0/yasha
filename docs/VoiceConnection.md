## VoiceConnection

Utility function for connecting to a voice channel.

### VoiceConnection.js

```js
const {VoiceConnection} = require('yasha');

VoiceConnection.connect(channel).then((connection) => {
	console.log('Connected!');
}).catch((error) => {
	console.error('Could not connect', error.message);
});
```

#### Functions

Connect

Connects to a voice channel.
```js
const {VoiceChannel} = require('discord.js');

VoiceConnection.connect(channel: VoiceChannel): Promise<VoiceConnection>
```

Get

Gets the voice channel from the guild.
```js
const {Guild} = require('discord.js');

VoiceConnection.get(guild: Guild): VoiceConnection
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

Rejoin

```js
const {VoiceChannel} = require('discord.js');

var connection = await VoiceConnection.connect(...);

connection.rejoin(channel: VoiceChannel): void
```

Disconnect/Destroy

```js
var connection = await VoiceConnection.connect(...);

connection.disconnect(): void // alias for destroy
connection.destroy(): void
```

Ready

```js
var connection = await VoiceConnection.connect(...);

connection.ready(): boolean; // whether the connection is ready
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