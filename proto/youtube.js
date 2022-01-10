const {
	playlist, playlist_params, playlist_offset,
	search_sort, search_filters, search, search_continuation, search_options
} = require('./build/youtube_pb');

function bin_b64(binary){
	return Buffer.from(binary).toString('base64').replaceAll('+', '-').replaceAll('/', '_');
}

function binary_to_b64_no_pad(binary){
	var str = bin_b64(binary),
		index = str.indexOf('=');
	if(index != -1)
		str = str.substring(0, index);
	return str;
}

function binary_to_b64url(binary){
	return encodeURIComponent(bin_b64(binary));
}

module.exports = {
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