const errors = {
	NETWORK_ERROR: {
		message: 'Network error',
		code: 1
	},

	INVALID_RESPONSE: {
		message: 'Invalid response',
		code: 2
	},

	INTERNAL_ERROR: {
		message: 'Internal error',
		code: 3
	},

	NOT_FOUND: {
		message: 'Not found',
		code: 4
	},

	UNPLAYABLE: {
		message: 'Unplayable',
		code: 5
	}
};

const errorCode = {};

for(const name in errors)
	errorCode[errors[name].code] = errors[name];

class SourceError extends Error{
	constructor(code, message, error){
		super(message || errorCode[code].message);

		this.code = code;

		if(error){
			this.stack = error.stack;
			this.details = error.message;
		}
	}
}

SourceError.codes = {};

for(const name in errors){
	SourceError[name] = SourceError.bind(null, errors[name].code);
	SourceError.codes[name] = errors[name].code;
}

module.exports = SourceError;