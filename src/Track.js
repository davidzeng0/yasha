class TrackStream{
	constructor(url){
		this.url = url;
		this.video = false;
		this.audio = false;
		this.bitrate = 0;
		this.duration = 0;
		this.container = null;
		this.codecs = null;
	}

	setTracks(video, audio){
		this.video = video;
		this.audio = audio;

		return this;
	}

	setBitrate(bitrate){
		this.bitrate = bitrate;

		return this;
	}

	setDuration(duration){
		this.duration = duration;

		return this;
	}

	setMetadata(container, codecs){
		this.container = container;
		this.codecs = codecs;

		return this;
	}

	equals(other){
		return false;
	}
}

class TrackStreams extends Array{
	constructor(live){
		super();

		this.live = live;
	}

	expired(){
		return false;
	}
}

class Track{
	constructor(platform){
		this.platform = platform;
		this.playable = true;
	}

	setOwner(name, icons){
		this.owner_name = name;
		this.icons = icons;

		return this;
	}

	setMetadata(id, title, duration, thumbnails){
		this.id = id;
		this.title = title;
		this.duration = duration;
		this.thumbnails = thumbnails;

		return this;
	}

	setStreams(streams, volume = 1){
		this.streams = streams;
		this.volume = volume;

		return this;
	}

	setPlayable(playable){
		this.playable = playable;

		return this;
	}

	/**
	 * @returns {Promise<Track>}
	 */
	async getStreams(){
		return null;
	}

	get url(){
		return null;
	}

	equals(other){
		return this.id == other.id && this.platform == other.platform;
	}
}

class TrackResults extends Array{
	/**
	 * @returns {Promise<TrackResults>}
	 */
	async next(){
		return null;
	}
}

class TrackPlaylist extends TrackResults{
	setMetadata(title, description){
		this.title = title;
		this.description = description;
	}

	setFirstTrack(track){
		this.first_track = track;
	}

	/**
	 * @returns {Promise<TrackPlaylist>}
	 */
	async next(){
		return null;
	}
}

class TrackImage{
	constructor(url, width, height){
		this.url = url || null;
		this.width = width || 0;
		this.height = height || 0;
	}

	static from(array){
		if(!array)
			return [];
		for(var i = 0; i < array.length; i++)
			array[i] = new TrackImage(array[i].url, array[i].width, array[i].height);
		return array;
	}
}

module.exports = {Track, TrackResults, TrackPlaylist, TrackImage, TrackStream, TrackStreams};