;(function(window, document){

	var baseurl    = '<%= baseurl %>';
	var data       = <%- JSON.stringify(data) %>;
	var PRODUCTION = <%= env === 'production' %>;

	<% include "external.mjs" %>

})(window, document);
