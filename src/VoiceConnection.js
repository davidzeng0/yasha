const voice = require('@discordjs/voice');
const {VoiceConnectionStatus, VoiceConnectionDisconnectReason} = voice;

class VoiceConnection extends voice.VoiceConnection{
	constructor(channel, options){
		super({
			channelId: channel.id,
			guildId: channel.guild.id,
			...options
		}, {adapterCreator: channel.guild.voiceAdapterCreator});

		this.guild = channel.guild;
		this.guild.me.voice.connection = this;
		this.connect_timeout = null;
		this.connected = false;

		this.await_connection();
		this._state.status = VoiceConnectionStatus.Ready;

		if(super.rejoin())
			this._state.status = VoiceConnectionStatus.Signalling;
	}

	rejoin(channelId){
		if(this.joinConfig.channelId != channelId)
			super.rejoin({channelId});
	}

	disconnect_reason(reason){
		switch(reason){
			case VoiceConnectionDisconnectReason.AdapterUnavailable:
				return 'Adapter unavailable';
			case VoiceConnectionDisconnectReason.EndpointRemoved:
				return 'Endpoint removed';
			case VoiceConnectionDisconnectReason.WebSocketClose:
				return 'WebSocket closed';
			case VoiceConnectionDisconnectReason.Manual:
				return 'Manual disconnect';
		}
	}

	ready(){
		return this.state.status == VoiceConnectionStatus.Ready;
	}

	addStatePacket(packet){
		if(!packet.channel_id)
			this.destroy();
		else
			super.addStatePacket(packet);
	}

	onNetworkingError(error){
		if(this.promise)
			this.promise_reject(error);
		else
			this.emit('error', error);
		this.destroy();
	}

	handle_state_change(state){
		switch(state.status){
			case VoiceConnectionStatus.Destroyed:
				this.promise_reject(new Error('Connection destroyed'));

				break;
			case VoiceConnectionStatus.Disconnected:
				this.promise_reject(new Error(this.disconnect_reason(state.reason)));

				break;
			case VoiceConnectionStatus.Ready:
				this.promise_resolve();

				break;
		}
	}

	set state(state){
		if(state.status != this.state.status){
			if(this.promise)
				this.handle_state_change(state);
			else if(state.status == VoiceConnectionStatus.Disconnected){
				if(state.reason == VoiceConnectionDisconnectReason.WebSocketClose)
					this.await_connection();
				else
					this.destroy(state.reason != VoiceConnectionDisconnectReason.AdapterUnavailable);
			}
		}

		super.state = state;
	}

	get state(){
		return this._state;
	}

	destroy(adapter_available = true){
		if(this.state.status == VoiceConnectionStatus.Destroyed)
			return;
		if(adapter_available){
			this._state.status = VoiceConnectionStatus.Disconnected;

			super.disconnect();
		}

		this.state = {status: VoiceConnectionStatus.Destroyed};

		if(this.guild.me.voice.connection == this)
			this.guild.me.voice.connection = null;
		else
			console.warn('Voice connection mismatch');
	}

	disconnect(){
		this.destroy();
	}

	async await_connection(){
		if(this.state.status == VoiceConnectionStatus.Ready || this.promise)
			return;
		this.promise = new Promise((resolve, reject) => {
			this.promise_resolve = resolve;
			this.promise_reject = reject;
		});

		this.timeout = setTimeout(() => {
			this.timeout = null;
			this.promise_reject(new Error('Connection timed out'));
		}, 15000);

		try{
			await this.promise;

			this.connected = true;
		}catch(e){
			if(this.connected)
				this.emit('error', e);
			this.destroy();
		}finally{
			clearTimeout(this.timeout);

			this.timeout = null;
			this.promise = null;
			this.promise_resolve = null;
			this.promise_reject = null;
		}
	}

	static async connect(channel, options = {}){
		if(!channel.joinable)
			throw new Error(channel.full ? 'Channel is full' : 'No permissions');
		var voice_state = channel.guild.voiceStates.resolve(channel.guild.me.id);

		if(!voice_state)
			voice_state = channel.guild.voiceStates._add({user_id: channel.guild.me.id});
		var connection = voice_state.connection;

		if(!connection)
			connection = new VoiceConnection(channel, options);
		else
			connection.rejoin(channel.id);
		if(connection.ready())
			return connection;
		connection.await_connection();

		await connection.promise;

		return connection;
	}
}

VoiceConnection.Status = VoiceConnectionStatus;

module.exports = VoiceConnection;