const EventEmitter = require('events');

const AudioPlayer = require('sange');

const sodium = require('sodium');

const random_bytes = Buffer.alloc(24);
const connection_nonce = Buffer.alloc(24);
const audio_nonce = Buffer.alloc(24);
const audio_buffer = Buffer.alloc(7678);

const silence = Buffer.from([0xfc, 0xff, 0xfe]);

/* these bytes never change */
audio_buffer[0] = 0x80;
audio_buffer[1] = 0x78;

const MAX_PLAY_ID = 2 ** 32 - 1;
const ERROR_INTERVAL = 5 * 60 * 1000; /* 5 minutes */

const EncryptionMode = {
	NONE: 0,
	LITE: 1,
	SUFFIX: 2,
	DEFAULT: 3
};

class Subscription{
	constructor(connection, player){
		this.connection = connection;
		this.player = player;
	}

	unsubscribe(){
		this.connection.onSubscriptionRemoved(this);
		this.player.unsubscribe(this);
	}
}

class TrackPlayer extends EventEmitter{
	constructor(options){
		super();

		if(options){
			this.normalize_volume = options.normalize_volume;
		}

		this.last_error = 0;

		this.track = null;
		this.stream = null;
		this.subscriptions = [];

		this.play_id = 0;

		this.silence_frames_interval = null;
		this.silence_frames_left = 0;
		this.silence_frames_needed = false;

		this.player = null;
	}

	subscribe(connection){
		var subscription = new Subscription(connection, this);

		this.subscriptions.push(subscription);

		return subscription;
	}

	unsubscribe(subscription){
		this.subscriptions.splice(this.subscriptions.indexOf(subscription), 1);

		if(!this.subscriptions.length)
			this.destroy();
	}

	unsubscribe_all(){
		while(this.subscriptions.length)
			this.subscriptions[0].unsubscribe();
	}

	onpacket(packet){
		this.stop_silence_frames();
		this.send(packet);
		this.emit('packet', packet);
	}

	onfinish(){
		this.emit('finish');
		this.start_silence_frames();
	}

	onerror(error, code, retryable){
		if(this.error(error, retryable))
			return;
		this.track.streams = null;
		this.create_player(this.getTime());
		this.start();
	}

	create_player(start_time){
		this.destroy_player();

		this.player = new AudioPlayer(false);
		this.player.setOutput(2, 48000, 256000);

		if(start_time)
			this.player.seek(start_time);
		if(this.normalize_volume)
			this.player.setVolume(this.stream.volume);
		this.player.ffplayer.onready = this.emit.bind(this, 'ready');
		this.player.ffplayer.onpacket = this.onpacket.bind(this);
		this.player.ffplayer.onfinish = this.onfinish.bind(this);
		this.player.ffplayer.onerror = this.onerror.bind(this);
		this.player.ffplayer.ondebug = this.emit.bind(this, 'debug');
	}

	async load_streams(){
		var streams, play_id = this.play_id;

		if(this.track.streams && !this.track.streams.expired())
			streams = this.track.streams;
		else{
			try{
				streams = await this.track.getStreams();
			}catch(error){
				if(this.play_id == play_id)
					this.emit('error', error);
				return false;
			}

			if(this.play_id != play_id)
				return false;
			this.track.streams = streams;
		}

		this.stream = this.get_best_stream(streams);

		if(!this.stream){
			this.emit('error', new Error('No streams found'));

			return false;
		}

		return true;
	}

	send_silence(){
		this.send({buffer: silence, frame_size: 960});
	}

	send(frame){
		for(var subscription of this.subscriptions)
			this.send_frame_connection(frame, subscription.connection);
	}

	send_frame_connection(frame, connection){
		if(!connection.ready())
			return;
		connection.setSpeaking(true);

		var state = connection.state.networking.state,
			connection_data = state.connectionData,
			mode = connection_data.encryption_mode;
		if(!mode){
			switch(connection_data.encryptionMode){
				case 'xsalsa20_poly1305_lite':
					connection_data.encryption_mode = EncryptionMode.LITE;

					break;
				case 'xsalsa20_poly1305_suffix':
					connection_data.encryption_mode = EncryptionMode.SUFFIX;

					break;
				default:
					connection_data.encryption_mode = EncryptionMode.DEFAULT;

					break;
			}

			mode = connection_data.encryption_mode;
		}

		connection_data.sequence++;
		connection_data.timestamp += frame.frame_size;

		if(connection_data.sequence > 65535)
			connection_data.sequence = 0;
		if(connection_data.timestamp > 4294967295)
			connection_data.timestamp = 0;
		audio_buffer.writeUIntBE(connection_data.sequence, 2, 2);
		audio_buffer.writeUIntBE(connection_data.timestamp, 4, 4);
		audio_buffer.writeUIntBE(connection_data.ssrc, 8, 4);

		var len, buf;

		switch(mode){
			case EncryptionMode.LITE:
				len = 16;
				connection_data.nonce++;

				if(connection_data.nonce > 4294967295)
					connection_data.nonce = 0;
				connection_nonce.writeUInt32BE(connection_data.nonce, 0);
				buf = sodium.api.crypto_secretbox_easy(frame.buffer, connection_nonce, connection_data.secretKey);
				audio_buffer.set(connection_nonce.slice(0, 4), 12 + buf.length);

				break;
			case EncryptionMode.SUFFIX:
				len = 36;
				sodium.api.randombytes_buf(random_bytes);
				buf = sodium.api.crypto_secretbox_easy(frame.buffer, random_bytes, connection_data.secretKey);
				audio_buffer.set(random_bytes, 12 + buf.length);

				break;
			case EncryptionMode.DEFAULT:
				len = 12;
				audio_buffer.copy(audio_nonce, 0, 0, 12);
				buf = sodium.api.crypto_secretbox_easy(frame.buffer, audio_nonce, connection_data.secretKey);

				break;
		}

		audio_buffer.set(buf, 12);
		state.udp.send(new Uint8Array(audio_buffer.slice(0, len + buf.length)));
	}

	start_silence_frames(){
		if(!this.silence_frames_needed || this.silence_frames_interval)
			return;
		this.silence_frames_needed = false;
		this.silence_frames_interval = setInterval(() => {
			this.silence_frames_left--;

			this.send_silence();

			if(!this.silence_frames_left){
				clearInterval(this.silence_frames_interval);

				this.silence_frames_interval = null;
			}
		}, 20);
	}

	stop_silence_frames(){
		if(this.silence_frames_needed)
			return;
		if(this.silence_frames_interval){
			clearInterval(this.silence_frames_interval);

			this.silence_frames_interval = null;
		}

		this.silence_frames_needed = true;
		this.silence_frames_left = 5;
	}

	error(error, retryable){
		if(!retryable || Date.now() - this.last_error < ERROR_INTERVAL){
			this.destroy_player();
			this.emit('error', error);

			return true;
		}

		this.last_error = Date.now();

		return false;
	}

	get_best_stream(streams){
		var volume = streams.volume;
		var opus = [], audio = [], other = [];

		for(var stream of streams){
			if(!stream.audio)
				continue;
			if(stream.video){
				other.push(stream);

				continue;
			}

			if(stream.codecs == 'opus')
				opus.push(stream);
			else
				audio.push(stream);
		}

		if(opus.length)
			streams = opus;
		else if(audio.length)
			streams = audio;
		else
			streams = other;
		var result = null;

		if(streams.length){
			result = streams.reduce((best, cur) => {
				return cur.bitrate > best.bitrate ? cur : best;
			});

			result.volume = volume;
		}

		return result;
	}

	play(track){
		this.play_id++;
		this.last_error = 0;

		this.stream = null;
		this.track = track;

		if(this.play_id > MAX_PLAY_ID)
			this.play_id = 0;
		this.create_player();
	}

	async start(){
		if(!await this.load_streams() || !this.player) /* destroy could have been called while waiting */
			return;
		this.player.setURL(this.stream.url);
		this.player.start();
	}

	isPaused(){
		return this.player.isPaused();
	}

	setPaused(paused){
		if(paused)
			this.start_silence_frames();
		return this.player.setPaused(paused);
	}

	setVolume(volume){
		return this.player.setVolume(volume);
	}

	setBitrate(bitrate){
		return this.player.setBitrate(bitrate);
	}

	setRate(rate){
		return this.player.setRate(rate);
	}

	setTempo(tempo){
		return this.player.setTempo(tempo);
	}

	setTremolo(depth, rate){
		return this.player.setTremolo(depth, rate);
	}

	setEqualizer(eqs){
		return this.player.setEqualizer(eqs);
	}

	seek(time){
		this.start_silence_frames();

		return this.player.seek(time);
	}

	getTime(){
		return this.player.getTime();
	}

	getDuration(){
		return this.player.getDuration();
	}

	getFramesDropped(){
		return this.player.getFramesDropped();
	}

	getTotalFrames(){
		return this.player.getTotalFrames();
	}

	stop(){
		this.start_silence_frames();

		return this.player.stop();
	}

	destroy_player(){
		if(this.player){
			this.start_silence_frames();
			this.player.destroy();
			this.player = null;
		}
	}

	cleanup(){
		this.destroy_player();
	}

	destroy(){
		this.unsubscribe_all();

		if(this.player){
			this.player.destroy();
			this.player = null;
		}

		if(this.silence_frames_interval){
			clearInterval(this.silence_frames_interval);

			this.silence_frames_interval = null;
		}
	}
}

module.exports = TrackPlayer;