const voice = require('@discordjs/voice');
const {GenericError} = require('js-common');
const {VoiceConnectionStatus, VoiceConnectionDisconnectReason} = voice;

class VoiceConnection extends voice.VoiceConnection{
	constructor(channel, options){
		super({
			channelId: channel.id,
			guildId: channel.guild.id,
			...options
		}, {adapterCreator: channel.guild.voiceAdapterCreator});

		this.guild = channel.guild;
		this.guild.voice_connection = this;
		this.connect_timeout = null;
		this.connected = false;

		this.await_connection();
		this._state.status = VoiceConnectionStatus.Ready;

		if(super.rejoin())
			this._state.status = VoiceConnectionStatus.Signalling;
	}

	rejoin_id(channelId){
		if(this.joinConfig.channelId != channelId)
			super.rejoin({channelId});
	}

	rejoin(channel){
		if(channel.guild.id != this.guild.id)
			throw new GenericError('Channel is not in the same guild');
		if(!channel.joinable)
			throw new GenericError(channel.full ? 'Channel is full' : 'No permissions');
		this.rejoin_id(channel.id);
	}

	static disconnect_reason(reason){
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
		else{
			this.emit('error', error);
			this.destroy();
		}
	}

	handle_state_change(state){
		switch(state.status){
			case VoiceConnectionStatus.Destroyed:
				this.promise_reject(new GenericError('Connection destroyed'));

				break;
			case VoiceConnectionStatus.Disconnected:
				this.promise_reject(new GenericError(VoiceConnection.disconnect_reason(state.reason)));

				break;
			case VoiceConnectionStatus.Ready:
				this.promise_resolve();

				this.state.networking.state.ws.sendPacket({
					op: 15, /* MEDIA_SINK_WANTS */
					d: {
						any: this.joinConfig.receiveAudio === false ? 0 : 100
					}
				});

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
			this._state.status = VoiceConnectionStatus.Destroyed;

			/* remove the subscription */
			this.state = {
				status: VoiceConnectionStatus.Destroyed,
				adapter: this.state.adapter
			};

			this._state.status = VoiceConnectionStatus.Disconnected;

			super.disconnect();
		}

		if(this.guild.voice_connection == this)
			this.guild.voice_connection = null;
		else
			console.warn('Voice connection mismatch');
		this.state = {status: VoiceConnectionStatus.Destroyed};
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
			this.promise_reject(new GenericError('Connection timed out'));
		}, 15000);

		try{
			await this.promise;

			this.connected = true;
		}catch(e){
			if(this.connected)
				this.emit('error', GenericError(e));
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
			throw new GenericError(channel.full ? 'Channel is full' : 'No permissions');
		var connection = channel.guild.voice_connection;

		if(!connection)
			connection = new VoiceConnection(channel, options);
		else
			connection.rejoin_id(channel.id);
		if(connection.ready())
			return connection;
		connection.await_connection();

		await connection.promise;

		return connection;
	}

	static get(guild){
		return guild.voice_connection;
	}

	static disconnect(guild, options){
		if(guild.voice_connection){
			guild.voice_connection.disconnect();

			return true;
		}

		if(!guild.me.voice.channel)
			return false;
		var {rejoin, disconnect} = voice.VoiceConnection.prototype;

		var dummy = {
			state: {
				status: VoiceConnectionStatus.ready,
				adapter: guild.voiceAdapterCreator({
					onVoiceServerUpdate(){},
					onVoiceStateUpdate(){},
					destroy(){}
				})
			},

			joinConfig: {
				guildId: guild.id,
				channelId: guild.me.voice.channel.id,
				...options
			}
		};

		if(!rejoin.call(dummy))
			throw new GenericError(this.disconnect_reason(VoiceConnectionDisconnectReason.AdapterUnavailable));
		dummy.state.status = VoiceConnectionStatus.Ready;

		if(!disconnect.call(dummy))
			throw new GenericError(this.disconnect_reason(VoiceConnectionDisconnectReason.AdapterUnavailable));
		return true;
	}
}

VoiceConnection.Status = VoiceConnectionStatus;

module.exports = VoiceConnection;