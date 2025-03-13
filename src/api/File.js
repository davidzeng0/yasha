const {Track, TrackStream, TrackStreams} = require('../Track');
const {UnplayableError} = require('../Error');
const {UnsupportedError} = require('js-common');

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
		throw new UnplayableError({simpleMessage: 'Stream expired or not available'});
	}

	async fetch(){
		throw new UnsupportedError('Cannot fetch on a FileTrack');
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
        throw new UnsupportedError();
    }

    /**
     *
     * @param {string} url
     * @returns {Promise<never>}
     */
    async get_streams(url) {
        throw new UnsupportedError();
    }

    /**
     *
     * @param {string} url
     * @param {number} [length]
     * @returns {Promise<never>}
     */
    async playlist(url, length) {
        throw new UnsupportedError();
    }

	create(url, isfile){
		return new FileTrack(url, isfile);
	}
}

module.exports = new File();
module.exports.Track = FileTrack;