const {Track, TrackStream, TrackStreams} = require('../Track');
const SourceError = require('../SourceError');
const Source = require('../Source')

class FileStream extends TrackStream{
	constructor(url, isfile){
		super(url);

		this.is_file = isfile;
		this.setTracks(true, true); /* we don't know what kind of tracks are in this file */
	}

	equals(other){
		return other instanceof FileStream && this.url && this.url == other.url;
	}
}

class FileStreams extends TrackStreams{
	from(url, isfile){
		this.push(new FileStream(url, isfile));

		return this;
	}
}

class FileTrack extends Track{
	constructor(url, isfile = false){
		super('File');

		this.stream_url = url;
		this.id = url;
		this.isLocalFile = isfile;
		this.setStreams(new FileStreams().from(url, isfile))
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
	/**
     *
     * @param {string} url
     * @returns {Promise<never>}
     */
    async get(url) {
        throw new Error('Unsupported');
    }

    /**
     *
     * @param {string} url
     * @returns {Promise<never>}
     */
    async get_streams(url) {
        throw new Error('Unsupported');
    }

    /**
     * 
     * @param {string} url
     * @param {number} [length]
     * @returns {Promise<never>}
     */
    async playlist(url, length) {
        throw new Error('Unsupported');
    }

	create(url, isfile){
		return new FileTrack(url, isfile);
	}
}

module.exports = new File();
module.exports.Track = FileTrack;