const path = require('path');
const Mjs  = require('./mjs');

const argv = require('minimist')(process.argv.slice(2));

const mjs = new Mjs({
	watch      : false,
	compress   : true,
	precompile : false,
	root       : path.resolve(__dirname, 'views'),
	log        : true
});

function compile () {
	let data = {
		baseurl: 'http://localhost',
		data: {
			a:'a',
			b: 123
		},
		env: 'production'
	};

	console.time('RESULT');
	mjs.renderFile('index.mjs', data, function(err, text) {
		if (err) {
			throw err;
		}
		console.timeEnd('RESULT');
		console.log(text);
	});
}

compile();

setTimeout(compile, 3000);