import { VoiceChannel, Guild } from 'discord.js';
import { VoiceConnectionStatus } from '@discordjs/voice';
import EventEmitter from 'events';

declare class VoiceConnection extends EventEmitter{
	static connect(channel: VoiceChannel): Promise<VoiceConnection>;

	static get(guild: Guild): VoiceConnection | null | undefined;
	static disconnect(guild: Guild): boolean;

	rejoin(channel: VoiceChannel): void;
	disconnect(): void;
	destroy(): void;
	ready(): boolean;
	subscribe(player: TrackPlayer): void;

	on(event: VoiceConnectionStatus.Disconnected, callback: () => void): this;
	on(event: VoiceConnectionStatus.Destroyed, callback: () => void): this;
	on(event: VoiceConnectionStatus.Ready, callback: () => void): this;
	on(event: VoiceConnectionStatus.Signalling, callback: () => void): this;
	on(event: VoiceConnectionStatus.Connecting, callback: () => void): this;
	on(event: 'error', callback: (error: Error) => void): this;

	static Status: typeof VoiceConnectionStatus;
}

declare namespace Track{
	export class TrackImage{
		url: string | null;
		width: number;
		height: number;
	}

	export class TrackStream{
		url: string | null;
		video: boolean;
		audio: boolean;
		bitrate: number;
		duration: number;
		container: string | null;
		codecs: string | null;

		getUrl?: () => Promise<string>;
	}

	export class TrackStreams extends Array{
		volume: number;
		live: boolean;

		expired(): boolean;
	}

	export class TrackResults extends Array{
		next(): Promise<TrackResults | null>;
	}

	export class TrackPlaylist extends TrackResults{
		title: string | null;
		description: string | null;
		firstTrack: Track | null;

		get url(): string | null;

		load(): Promise<TrackPlaylist>;
		next(): Promise<TrackPlaylist | null>;
	}

	export class Track{
		platform: string;
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
}

declare class FileTrack extends Track.Track{
	isLocalFile: boolean;
}

declare class APISource{
	get(id: string): Promise<Track.Track>;
	search(query: string): Promise<Track.TrackResults>;
	playlist(id: string, length?: number): Promise<Track.TrackPlaylist>;
}

declare class YoutubeSource extends APISource{
	setCookie(cookie: string): void;
}

declare class FileSource{
	static resolve(url: string): FileTrack | null;
}

declare enum SourceErrorCodes{
	NETWORK_ERROR = 1,
	INVALID_RESPONSE = 2,
	INTERNAL_ERROR = 3,
	NOT_FOUND = 4,
	UNPLAYABLE = 5,
	NOT_A_TRACK = 6
}

declare class SourceErrorConstructor extends SourceError{
	constructor(message?: string, error?: Error);
}

declare class SourceError extends Error{
	code: number;
	message: string;
	stack?: string;
	details?: string;

	static NETWORK_ERROR: typeof SourceErrorConstructor;
	static INVALID_RESPONSE: typeof SourceErrorConstructor;
	static INTERNAL_ERROR: typeof SourceErrorConstructor;
	static NOT_FOUND: typeof SourceErrorConstructor;
	static UNPLAYABLE: typeof SourceErrorConstructor;
	static NOT_A_TRACK: typeof SourceErrorConstructor;
	static codes: typeof SourceErrorCodes;
}

declare class Source{
	static resolve(input: string): Promise<Track.Track | Track.TrackPlaylist> | null;
	static resolve(input: string, weak: boolean): Promise<Track.Track | Track.TrackPlaylist> | null;
	static Error: typeof SourceError;
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

	play(track: Track.Track): void;
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
	on(event: 'error', callback: (error: Error | SourceError) => void): this;
	on(event: 'ready', callback: () => void): this;
}

declare const api: {
	Youtube: any;
	Soundcloud: any;
	Spotify: any;
}

export { api, Source, TrackPlayer, VoiceConnection, Track };