const {GenericError} = require("js-common");

class UnplayableError extends GenericError{
	constructor(arg){
		super(arg, 'Track is unplayable')
	}
}

class NotATrackError extends GenericError{
	constructor(arg){
		super(arg, 'Link does not lead to a track');
	}
}

module.exports = {
	UnplayableError,
	NotATrackError
};