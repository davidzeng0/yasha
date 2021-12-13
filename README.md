# yasha
Audio Player interface for Discord.js

*Sange and Yasha, when attuned by the moonlight and used together, become a very powerful combination.*

### prerequisites
See [sange](https://github.com/ilikdoge/sange) dependencies

### install
```bash
npm i git://github.com/ilikdoge/yasha.git
```

Example usage

```js
// designed to work with discord.js v13+ and uses discordjs/voice internally for voice connections

var connection = await VoiceConnection.connect(voiceChannel); // see docs/VoiceConnection.md
var player = new TrackPlayer(); // see docs/TrackPlayer.md

var track = await Source.resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); // see docs/Source.md

connection.subscribe(player);
player.play(track);
player.start();
```

Sample code
```js
// designed to work with discord.js v13+ and uses discordjs/voice internally for voice connections

const Discord = require('discord.js');
const client = new Discord.Client();

const {Source, TrackPlayer, VoiceConnection} = require('yasha');

client.on('ready', () => {
	console.log('Ready!');
});

client.on('message', (message) => {
	if(message.content == 'play a song!'){
		var connection = await VoiceConnection.connect(message.member.voice.channel); // see docs/VoiceConnection.md
		var player = new TrackPlayer(); // see docs/TrackPlayer.md

		var track = await Source.resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); // see docs/Source.md

		connection.subscribe(player);
		player.play(track);
		player.start();
	}
});

client.login('your token');
```