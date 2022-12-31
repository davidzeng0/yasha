# yasha
Audio Player interface for Discord.js

*Sange and Yasha, when attuned by the moonlight and used together, become a very powerful combination.*

### prerequisites
Only compiles on Linux or WSL2+.

1. Install [sange](https://github.com/davidzeng0/sange) dependencies
2. libsodium
3. libtool
4. protoc

### install
```bash
# dependencies
apt install libsodium-dev libtool protobuf-compiler

# install
npm i git://github.com/davidzeng0/yasha.git
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
