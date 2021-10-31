const {VoiceConnectionStatus, joinVoiceChannel} = require('@discordjs/voice');

class ConnectionState{
	constructor(connection){
		this.connection = connection;
		this.connection.addStatePacket = this.onVoiceStateUpdate.bind(this);
		this.connection.addServerPacket = this.onVoiceServerUpdate.bind(this);

		this.onDisconnect = this.onDisconnect.bind(this);
		this.onDestroy = this.onDestroy.bind(this);
		this.connection.on(VoiceConnectionStatus.Disconnected, this.onDisconnect);
		this.connection.on(VoiceConnectionStatus.Destroyed, this.onDestroy);

		this.awaitConnected();
	}

	async awaitConnected(){
		if(this.connection.state.status == VoiceConnectionStatus.Ready || this.promise)
			return;
		this.promise = new Promise((resolve, reject) => {
			var connection = this.connection;

			if(!connection)
				return reject(new Error('Connection destroyed'));
			var timeout = setTimeout(() => {
				removeListeners();
				reject(new Error('Connection timed out'));
			}, 15000);

			var callbacks = {
				[VoiceConnectionStatus.Destroyed]: () => {
					removeListeners();
					reject(new Error('Destroyed'));
				},

				[VoiceConnectionStatus.Disconnected]: () => {
					removeListeners();
					reject(new Error('Disconnected'));
				},

				[VoiceConnectionStatus.Ready]: () => {
					removeListeners();
					resolve();
				},

				error: (e) => {
					removeListeners();
					reject(e);
				}
			};

			var removeListeners = function(){
				clearTimeout(timeout);

				for(var callback in callbacks)
					connection.removeListener(callback, callbacks[callback]);
			};

			for(var callback in callbacks)
				connection.on(callback, callbacks[callback]);
		});

		try{
			await this.promise;
		}catch(e){
			if(this.connection){
				this.connection.emit('error', e);
				this.destroy();
			}
		}finally{
			this.promise = null;
		}
	}

	onVoiceStateUpdate(packet){
		if(!packet.channel_id)
			this.destroy();
		else if(this.connection)
			this.connection.__proto__.addStatePacket.call(this.connection, packet);
	}

	onVoiceServerUpdate(packet){
		if(this.connection)
			this.connection.__proto__.addServerPacket.call(this.connection, packet);
	}

	onDisconnect(){
		this.awaitConnected();
	}

	onDestroy(){
		this.destroy();
	}

	destroy(){
		if(this.connection){
			this.connection.removeListener(VoiceConnectionStatus.Disconnected, this.onDisconnect);
			this.connection.removeListener(VoiceConnectionStatus.Destroyed, this.onDestroy);

			if(this.connection.state.status != VoiceConnectionStatus.Destroyed)
				this.connection.destroy(false);
			this.connection = null;
		}
	}
}

module.exports = {
	async connect(channel, options = {}){
		if(!channel.joinable)
			throw new Error(channel.full ? 'Channel is full' : 'No permissions');
		var connection = joinVoiceChannel({channelId: channel.id, guildId: channel.guild.id, adapterCreator: channel.guild.voiceAdapterCreator, selfDeaf: false, ...options});

		if(connection.state.status == VoiceConnectionStatus.Ready)
			return connection;
		if(!connection.__sange__state)
			connection.__sange__state = new ConnectionState(connection);
		connection.__sange__state.awaitConnected();

		await connection.__sange__state.promise;

		return connection;
	}
};