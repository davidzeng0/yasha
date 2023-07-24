# yasha
Audio Player interface for Discord.js

*Sange and Yasha, when attuned by the moonlight and used together, become a very powerful combination.*

### Prerequisites
Only compiles on Linux or WSL2+.

1. Install [sange](https://github.com/davidzeng0/sange) dependencies
2. libsodium

### Install
```bash
# Debian dependencies
apt install libsodium-dev

# Arch dependencies
yay -Sy cmake

# install
npm i github:davidzeng0/yasha#dist
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
		Discord.GatewayIntentBits.Guilds,
		Discord.GatewayIntentBits.GuildMessages,
		Discord.GatewayIntentBits.GuildVoiceStates,
		Discord.GatewayIntentBits.MessageContent
	]
});

const {Source, TrackPlayer, VoiceConnection} = require('yasha');

client.on('ready', () => {
	console.log('Ready!');
});

client.on('messageCreate', async (message) => {
	if(message.content == 'play a song!'){
		// see docs/VoiceConnection.md
		var connection = await VoiceConnection.connect(message.member.voice.channel);

		// see docs/TrackPlayer.md
		var player = new TrackPlayer();

		// see docs/Source.md
		var track = await Source.resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

		connection.subscribe(player);
		player.play(track);
		player.start();

		await message.channel.send('Now playing: **' + track.title.replaceAll('**', '\\*\\*') + '**');
	}
});

client.login('your token here');
```
