## VoiceConnection

Utility function for connecting to a voice channel.

### VoiceConnection.js

```js
const {VoiceConnection} = require('yasha');

VoiceConnection.connect(channel).then((connection) => {
	console.log('Connected!');
});
```

Functions

Connect
```js
const {VoiceChannel} = require('discord.js');

VoiceConnection.connect(channel: VoiceChannel): Promise<VoiceConnection>
```