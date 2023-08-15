import { VoiceBasedChannel, Guild } from 'discord.js';
import { VoiceConnectionStatus, JoinConfig, VoiceConnectionDisconnectedState, VoiceConnectionState, VoiceConnectionDestroyedState, VoiceConnectionReadyState, VoiceConnectionSignallingState, VoiceConnectionConnectingState } from '@discordjs/voice';
import { GenericError } from 'js-common';
import EventEmitter from 'events';

declare interface VoiceConnectionOptions extends Partial<JoinConfig>{
	receiveAudio?: boolean;
}

declare class VoiceConnection extends EventEmitter{
	static connect(channel: VoiceBasedChannel, options?: VoiceConnectionOptions): Promise<VoiceConnection>;

	static get(guild: Guild): VoiceConnection | null | undefined;
	static disconnect(guild: Guild, options?: Partial<JoinConfig>): boolean;

	rejoin(channel: VoiceBasedChannel): void;
	disconnect(): void;
	destroy(adapterAvailable?: boolean): void;
	ready(): boolean;
	subscribe(player: TrackPlayer): void;

	on(event: VoiceConnectionStatus.Disconnected, callback: (oldState: VoiceConnectionState, newState: VoiceConnectionDisconnectedState) => void): this;
	on(event: VoiceConnectionStatus.Destroyed, callback: (oldState: VoiceConnectionState, newState: VoiceConnectionDestroyedState) => void): this;
	on(event: VoiceConnectionStatus.Ready, callback: (oldState: VoiceConnectionState, newState: VoiceConnectionReadyState) => void): this;
	on(event: VoiceConnectionStatus.Signalling, callback: (oldState: VoiceConnectionState, newState: VoiceConnectionSignallingState) => void): this;
	on(event: VoiceConnectionStatus.Connecting, callback: (oldState: VoiceConnectionState, newState: VoiceConnectionConnectingState) => void): this;
	on(event: 'error', callback: (error: Error) => void): this;

	static Status: typeof VoiceConnectionStatus;
}

declare class TrackImage{
	url: string | null;
	width: number;
	height: number;
}

declare class TrackStream{
	url: string | null;
	video: boolean;
	audio: boolean;
	bitrate: number;
	duration: number;
	container: string | null;
	codecs: string | null;

	getUrl?: () => Promise<string>;
}

declare class TrackStreams extends Array{
	volume: number;
	live: boolean;

	expired(): boolean;
}

declare class TrackResults extends Array{
	next(): Promise<TrackResults | null>;
}

declare class TrackPlaylist extends TrackResults{
	title: string | null;
	description: string | null;
	firstTrack: Track | null;

	get url(): string | null;

	load(): Promise<TrackPlaylist>;
	next(): Promise<TrackPlaylist | null>;
}

declare class Track{
	playable: boolean;

	author: string | null;
	icons: TrackImage[] | null;

	id: string | null;
	title: string | null;
	duration: number | null;
	thumbnails: TrackImage[] | null;

	streams: TrackStreams | null;

	getStreams(): Promise<TrackStreams>;
	fetch(): Promise<Track>;

	get url(): string | null;

	equals(other: Track): boolean;
}

declare class FileTrack extends Track{
	platform: 'File';
	isLocalFile: boolean;
}

declare class APISource{
	get(id: string): Promise<Track>;
	search(query: string): Promise<TrackResults>;
	playlist(id: string, length?: number): Promise<TrackPlaylist>;
}

declare class YoutubeSource extends APISource{
	setCookie(cookie: string): void;
	Music: any;
}

declare class FileSource{
	resolve(url: string): FileTrack | null;
}

declare class YoutubeTrack extends Track {
	platform: 'Youtube';
}

declare class YoutubePlaylist extends TrackPlaylist {
	platform: 'Youtube';
}

declare class SoundcloudTrack extends Track{
	platform: 'Soundcloud';
}

declare class SoundcloudPlaylist extends TrackPlaylist{
	platform: 'Soundcloud';
}

declare class SpotifyTrack extends Track{
	platform: 'Spotify';
}

declare class SpotifyPlaylist extends TrackPlaylist{
	platform: 'Spotify';
}

declare class AppleMusicTrack extends Track{
	platform: 'AppleMusic';
}

declare class AppleMusicPlaylist extends TrackPlaylist{
	platform: 'AppleMusic';
}

declare class Source{
	static resolve(input: string): Promise<YoutubeTrack | YoutubePlaylist | SoundcloudTrack | SoundcloudPlaylist | SpotifyTrack | SpotifyPlaylist | AppleMusicTrack | AppleMusicPlaylist | null>;
	static resolve(input: string, weak: boolean): Promise<YoutubeTrack | YoutubePlaylist | SoundcloudTrack | SoundcloudPlaylist | SpotifyTrack | SpotifyPlaylist | AppleMusicTrack | AppleMusicPlaylist | null>;
	static Youtube: YoutubeSource;
	static Soundcloud: APISource;
	static Spotify: APISource;
	static AppleMusic: APISource;
	static File: FileSource;
}

declare interface TrackPlayerOptions{
	normalize_volume?: boolean;
	external_encrypt?: boolean;
	external_packet_send?: boolean;
}

declare interface Packet{
	frame_size: number;
	buffer: Buffer;
}

declare interface EqualizerSetting{
	band: number;
	gain: number;
}

declare class TrackPlayer extends EventEmitter{
	constructor(options?: TrackPlayerOptions);

	play(track: Track): void;
	start(): Promise<void>;
	hasPlayer(): boolean;
	isPaused(): boolean;
	setPaused(paused: boolean): void;
	setVolume(volume: number): void;
	setBitrate(bitrate: number): void;
	setRate(rate: number): void;
	setTempo(tempo: number): void;
	setTremolo(depth: number, rate: number): void;
	setEqualizer(eqs: EqualizerSetting[]): void;
	seek(time: number): void;
	getTime(): number;
	getDuration(): number;
	getFramesDropped(): number;
	getTotalFrames(): number;
	isCodecCopy(): boolean;
	stop(): void;
	cleanup(): void;
	destroy(): void;

	on(event: 'packet', callback: (packet: Packet) => void): this;
	on(event: 'finish', callback: () => void): this;
	on(event: 'error', callback: (error: Error) => void): this;
	on(event: 'ready', callback: () => void): this;
}

declare const api: {
	Youtube: any;
	Soundcloud: any;
	Spotify: any;
}

declare class UnplayableError extends GenericError{}

declare class NotATrackError extends GenericError{}

export { api, Source, TrackPlayer, VoiceConnection, Track, TrackImage, TrackStream, TrackStreams, TrackResults, TrackPlaylist, UnplayableError, NotATrackError };
