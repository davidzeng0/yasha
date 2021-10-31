const AudioPlayer = require('sange');
const EventEmitter = require('events');

const {VoiceConnectionStatus} = require('@discordjs/voice');

const sodium = require('sodium');

const random_bytes = Buffer.alloc(24);
const audio_nonce = Buffer.alloc(24);
const audio_buffer = new Uint8Array(7678);

const silence = new Uint8Array([0xf8, 0xff, 0xfe]);

/* these bytes never change */
audio_nonce[0] = 0x80;
audio_nonce[1] = 0x78;

const MAX_PLAY_ID = 2 ** 32 - 1;
const ERROR_INTERVAL = 5 * 60 * 1000; /* 5 minutes */

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
	constructor(){
		super();

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
		var sub = this.subscriptions.find(sub => sub.connection == connection);

		if(!sub){
			sub = new Subscription(connection, this);

			this.subscriptions.push(sub);
		}

		return sub;
	}

	unsubscribe(sub){
		this.subscriptions.splice(this.subscriptions.indexOf(sub), 1);

		if(!this.subscriptions.length)
			this.destroy();
	}

	unsubscribe_all(){
		while(this.subscriptions.length)
			this.subscriptions[0].unsubscribe();
	}

	create_player(start_time){
		this.destroy_player();

		this.player = new AudioPlayer();
		this.player.setOutput(2, 48000, 256000);

		if(start_time)
			this.player.seek(start_time);
		this.player.on('ready', () => {
			this.emit('ready');
		});

		this.player.on('packet', (packet) => {
			this.stop_silence_frames();
			this.send(packet);
			this.emit('packet', packet);
		});

		this.player.on('finish', () => {
			this.emit('finish');
			this.start_silence_frames();
		});

		this.player.on('error', (error, retryable) => {
			if(this.error(error, retryable))
				return;
			this.track.streams = null;
			this.retry();
		});

		this.player.on('debug', (...args) => {
			this.emit('debug', ...args);
		});
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

	async load_streams(){
		var streams, play_id = this.play_id;

		if(this.track.streams && !this.track.streams.expired())
			streams = this.track.streams;
		else{
			try{
				streams = (await this.track.getStreams()).streams;
			}catch(e){
				if(this.play_id != play_id)
					throw new Error('play_id changed');
				this.emit('error', e);

				throw e;
			}

			if(this.play_id != play_id)
				throw new Error('play_id changed');
			this.track.streams = streams;
		}

		this.stream = this.getBestStream(streams);
	}

	send_silence(){
		this.send({buffer: silence, frame_size: 960});
	}

	send(frame){
		for(var subscription of this.subscriptions)
			this.send_frame_connection(frame, subscription.connection);
	}

	send_frame_connection(frame, connection){
		if(connection.state.status != VoiceConnectionStatus.Ready)
			return;
		connection.setSpeaking(true);

		var state = connection.state.networking.state;
		var connection_data = state.connectionData;
		var nonce_buffer = connection_data.nonceBuffer;

		connection_data.sequence++;
		connection_data.timestamp += frame.frame_size;

		if(connection_data.sequence > 65535)
			connection_data.sequence = 0;
		if(connection_data.timestamp > 4294967295)
			connection_data.timestamp = 0;

		audio_nonce.writeUIntBE(connection_data.ssrc, 8, 4);
		audio_nonce.writeUIntBE(connection_data.sequence, 2, 2);
		audio_nonce.writeUIntBE(connection_data.timestamp, 4, 4);

		audio_buffer.set(audio_nonce, 0);

		var len, buf;

		if(connection_data.encryptionMode == 'xsalsa20_poly1305_lite'){
			len = 32;
			connection_data.nonce++;

			if(connection_data.nonce > 4294967295)
				connection_data.nonce = 0;
			nonce_buffer.writeUInt32BE(connection_data.nonce, 0);

			buf = sodium.api.crypto_secretbox_easy(frame.buffer, nonce_buffer, connection_data.secretKey);

			audio_buffer.set(buf, 12);
			audio_buffer.set(nonce_buffer.slice(0, 4), 12 + buf.length);
		}else if(connection_data.encryptionMode == 'xsalsa20_poly1305_suffix'){
			len = 52;
			lib.api.randombytes_buf(random_bytes);
			buf = sodium.api.crypto_secretbox_easy(frame.buffer, random_bytes, connection_data.secretKey);

			audio_buffer.set(buf, 12);
			audio_buffer.set(random_bytes, 12 + buf.length);
		}else{
			len = 28;
			audio_buffer.set(sodium.api.crypto_secretbox_easy(frame.buffer, audio_nonce, connection_data.secretKey), 12);
		}

		state.udp.send(new Uint8Array(audio_buffer.buffer, 0, frame.buffer.length + len));
	}

	start_silence_frames(){
		if(this.silence_frames_interval || !this.silence_frames_needed)
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

	retry(){
		this.create_player(this.getTime());
		this.start();
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

	getBestStream(streams){
		var opus = [], mp4 = [], webm = [], other = [];

		for(var stream of streams){
			if(!stream.audio)
				continue;
			if(stream.video){
				if(stream.container == 'mp4' || stream.container == 'webm')
					other.push(stream);
				continue;
			}

			if(stream.codecs == 'opus')
				opus.push(stream);
			else if(stream.container == 'mp4')
				mp4.push(stream);
			else if(stream.container == 'webm')
				webm.push(stream);
			else
				other.push(stream);
		}

		var streams;

		if(opus.length)
			streams = opus;
		else if(webm.length)
			stremas = webm;
		else if(mp4.length)
			streams = mp4;
		else
			streams = other;
		if(streams.length)
			return streams.reduce((best, cur) => {
				return cur.bitrate > best.bitrate ? cur : best;
			});
		return null;
	}

	async start(){
		try{
			await this.load_streams();
		}catch(e){
			return;
		}

		if(!this.player)
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