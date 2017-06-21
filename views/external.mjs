;(function(window, document){

	var baseurl    = '<%= baseurl %>';
	var data       = <%- JSON.stringify(data) %>;
	var PRODUCTION = <%= env === 'production' %>;

})(window, document);
