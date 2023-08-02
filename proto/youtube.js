const {
	playlist, playlist_params, playlist_offset,
	search_sort, search_filters, search, search_continuation, search_options
} = require('../build/youtube_pb');

function binary_to_b64_no_pad(binary){
	return Buffer.from(binary).toString('base64url');
}

function bin_b64(binary){
	var str = binary_to_b64_no_pad(binary);

	while(str.length & 3)
		str += '=';
	return str;
}

function binary_to_b64url(binary){
	return encodeURIComponent(bin_b64(binary));
}

function b64url_to_binary(input){
	return Buffer.from(decodeURIComponent(input), 'base64');
}

module.exports = {
	playlist_next_offset(continuation){
		var p = playlist.deserializeBinary(b64url_to_binary(continuation));
		var cont = p.getContinuation();

		if(!cont)
			return undefined;
		var params = cont.getParams();

		if(!params)
			return undefined;
		params = playlist_params.deserializeBinary(b64url_to_binary(params));

		var offset = params.getOffset();

		if(!offset)
			return undefined;
		var p_offset = playlist_offset.deserializeBinary(b64url_to_binary(offset.substring('PT:'.length)));

		return p_offset.getOffset();
	},

	gen_playlist_continuation(id, offset){
		var p_offset = new playlist_offset(), p_params = new playlist_params(),
			p_cont = new playlist.playlist_continuation(), p = new playlist();
		p_offset.setOffset(offset);
		p_params.setPage(Math.floor(offset / 100));
		offset = `PT:${offset ? binary_to_b64_no_pad(p_offset.serializeBinary()) : 'CAA'}`;
		p_params.setOffset(offset);
		p_cont.setVlid('VL' + id);
		p_cont.setParams(binary_to_b64url(p_params.serializeBinary()));
		p_cont.setId(id);
		p.setContinuation(p_cont);

		return binary_to_b64url(p.serializeBinary());
	},

	gen_search_continuation(query, offset, options){
		var s_cont = new search_continuation(),
			s_data = new search_continuation.search_data(),
			s_filters = new search_filters(),
			s_options = new search_options(),
			s_position = new search_options.search_position(),
			s_off = new search_options.search_position.off();
		s_off.setTotal(0);
		s_off.setPage(1);
		s_position.setOffset(s_off);
		s_options.setSort(search_sort.RELEVANCE);
		s_filters.setType(search_filters.Type.VIDEO);
		s_options.setFilters(s_filters);
		s_options.setOffset(offset);
		s_options.setPosition(s_position);
		s_data.setQuery(query);
		s_data.setOptions(binary_to_b64url(s_options.serializeBinary()));
		s_cont.setData(s_data);
		s_cont.setConst(52047873);
		s_cont.setType('search-feed');

		return binary_to_b64url(s_cont.serializeBinary());
	},

	gen_search_options(opts){
		var options = new search(),
			filters = new search_filters();
		switch(opts.sort){
			case 'relevance':
				options.setSort(search_sort.RELEVANCE);

				break;
			case 'rating':
				options.setSort(search_sort.RATING);

				break;
			case 'upload_date':
				options.setSort(search_sort.UPLOAD_DATE);

				break;
			case 'view_count':
				options.setSort(search_sort.VIEW_COUNT);

				break;
		}

		switch(opts.type){
			case 'video':
				filters.setType(search_filters.Type.VIDEO);

				break;
			case 'channel':
				filters.setType(search_filters.Type.CHANNEL);

				break;
			case 'playlist':
				filters.setType(search_filters.Type.PLAYLIST);

				break;
			case 'movie':
				filters.setType(search_filters.Type.MOVIE);

				break;
		}

		switch(opts.duration){
			case 'short':
				filters.setDuration(search_filters.Duration.SHORT);

				break;
			case 'medium':
				filters.setDuration(search_filters.Duration.MEDIUM);

				break;
			case 'long':
				filters.setDuration(search_filters.Duration.LONG);

				break;
		}

		if(opts.features){
			if(opts.features.hd)
				filters.setIs_hd(true);
			if(opts.features.cc)
				filters.setHas_cc(true);
			if(opts.features.creativeCommons)
				filters.setCreative_commons(true);
			if(opts.features.is3d)
				filters.setIs_3d(true);
			if(opts.features.live)
				filters.setIs_live(true);
			if(opts.features.purchased)
				filters.setPurchased(true);
			if(opts.features.is4k)
				filters.setIs_4k(true);
			if(opts.features.is360)
				filters.setIs_360(true);
			if(opts.features.location)
				filters.setHas_location(true);
			if(opts.features.hdr)
				filters.setHas_hdr(true);
			if(opts.features.vr180)
				filters.setIs_vr180(true);
		}

		options.setFilters(filters);

		return binary_to_b64url(options.serializeBinary());
	}
};