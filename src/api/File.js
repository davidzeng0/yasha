const {Track, TrackStream, TrackStreams} = require('../Track');
const SourceError = require('../SourceError');

class FileStream extends TrackStream{
	constructor(url){
		super(url);

		this.setTracks(true, true); /* unknown */
	}

	equals(other){
		return other instanceof FileStream && this.url && this.url == other.url;
	}
}

class FileStreams extends TrackStreams{
	from(url){
		this.push(new FileStream(url));

		return this;
	}
}

class FileTrack extends Track{
	constructor(url){
		super('File');

		this.stream_url = url;
		this.id = url;
		this.setStreams(new FileStreams().from(url))
	}

	async getStreams(){
		throw new SourceError.UNPLAYABLE('Stream expired or not available');
	}

	async fetch(){
		throw new SourceError.INTERNAL_ERROR(null, new Error('Cannot fetch on a FileTrack'));
	}

	get url(){
		return this.stream_url;
	}
}

class File{
	resolve(url){
		return new FileTrack(url);
	}
}

module.exports = new File();
module.exports.Track = FileTrack;