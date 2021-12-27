# yasha
Audio Player interface for Discord.js

*Sange and Yasha, when attuned by the moonlight and used together, become a very powerful combination.*

Only compiles on Linux or WSL2+.

### Install

1. Install [sange](https://github.com/ilikdoge/sange) dependencies noted in the README

2. Install dependancies for yasha
```bash
# dependencies
sudo apt install libsodium-dev libtool 

# install
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
const Discord = require('discord.js');
const client = new Discord.Client({
	intents: [
		Discord.Intents.FLAGS.GUILDS,
		Discord.Intents.FLAGS.GUILD_MESSAGES,
		Discord.Intents.FLAGS.GUILD_VOICE_STATES
	]
});

const {Source, TrackPlayer, VoiceConnection} = require('yasha');

client.on('ready', () => {
	console.log('Ready!');
});

client.on('message', async (message) => {
	if(message.content == 'play a song!'){
		var connection = await VoiceConnection.connect(message.member.voice.channel); // see docs/VoiceConnection.md
		var player = new TrackPlayer(); // see docs/TrackPlayer.md

		var track = await Source.resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); // see docs/Source.md

		connection.subscribe(player);
		player.play(track);
		player.start();

		await message.channel.send('Now playing: **' + track.title.replaceAll('**', '\\*\\*') + '**');
	}
});

client.login('your token here');
```
