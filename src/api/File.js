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

class FilePlaylist extends TrackPlaylist {
    /**
     *
     * @param {string} url
     * @param {boolean} [isfile]
     * @returns {this}
     */
    from(url, isfile) {
        this.push(new FileTrack(url, isfile))

        return this
    }
}

class File{
	/**
     *
     * @param {string} url
     * @returns {Promise<FileTrack | null>}
     */
    async get(url) {
        return Source.File.resolve(url)
    }

	/**
     *
     * @param {string} url
     * @returns {Promise<FileStream | null>}
     */
    async get_streams(url) {
        const resolved = await Source.File.resolve(url)
        if (resolved) return new FileStream(resolved.id, resolved.isLocalFile)
        return null
    }

	/**
     *
     * @param {string} url
     * @param {number} [length]
     * @returns {Promise<FilePlaylist>}
     */
    async playlist(url, length) {
        const track = await this.get(url)
        if (!track) return new FilePlaylist()
        return new FilePlaylist().setFirstTrack(track)
    }

	create(url, isfile){
		return new FileTrack(url, isfile);
	}
}

module.exports = new File();
module.exports.Track = FileTrack;