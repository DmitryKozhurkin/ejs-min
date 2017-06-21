/**
 * Шаблонизатор на основе EJS
 * производит минификацию js и css при компиляции шаблона
 */

'use strict';

const _            = require('lodash');
const path         = require('path');
const crypto       = require('crypto');
const fs           = require('fs');
const ejs          = require('ejs');
const uglifyjs     = require('uglify-js');
const uglifycss    = require('uglifycss');
const EventEmitter = require('events');

const reMjs = /\.mjs$/;
const reCss = /\.css$/;

class Mjs extends EventEmitter {
	constructor(options) {
		super();

		this.cache = new Cache();

		this.options = Object.assign({
			compress   : true,
			watch      : false,
			precompile : false,
			log        : false
		}, options);

		if (! this.options.root) {
			throw new Error('MJS: set root dir!');
		}

		this.log = this.options.log ? console.log : () => {};

		this.configure();
	}

	configure () {
		// Обновление шаблонов для отладки
		if (this.options.watch) {
			setInterval(() => {
				// this.log('MJS: clear cache');
				this.cache.clearAll();
			}, 1000);
		}

		if (this.options.precompile) {
			let ts = Date.now();
			this.precompile(this.options.root);
			this.log('MJS COMPILE TIME %sms', Date.now() - ts);
		}

		this.renderFile = this.renderFile.bind(this);
	}

	precompile (dir) {
		fs.readdirSync(dir)
			.filter(inode => {
				let fullpath = path.resolve(dir, inode);
				let stat = fs.statSync(fullpath);

				if (path.extname(inode) === '.mjs' && stat.isFile()) {
					return true;
				} else if (stat.isDirectory()) {
					this.precompile(fullpath);
				}

				return false;
			})
			.forEach(tmplname => {
				let tmplpath = path.resolve(dir, tmplname);
				this.compileFile(tmplpath, () => {
					this.log('MJS: [%s] precompiled', path.relative(this.options.root, tmplpath));
				});
			});
	}

	// Функция считывает шаблон и его подшаблоны из папки с шаблонами и записывает их содержимое в кэш,
	// попутно проставляя зависимости. Если шаблон уже был загружен содержимое берется из кэша
	read (tmplname, parent) {
		let re = /<%\s*include\s[\'\"](.+?)[\'\"]\s*%>/g,
			filestring = this.cache.getSourceText(tmplname),
			match = null,
			includer = null;

		if (! filestring) {
			filestring = fs.readFileSync(path.resolve(this.options.root, tmplname)).toString();

			if (reCss.test(tmplname)) {
				filestring = uglifycss.processString(filestring);
			}

			this.cache.setSourceText(tmplname, filestring);
		}

		if (parent) this.cache.addRelation(tmplname, parent);

		if (! reMjs.test(tmplname)) return filestring;

		while (match = re.exec(filestring)) {
			includer = this.read(match[1], tmplname);
			filestring = filestring.replace(match[0], includer);
		}

		return filestring;
	}

	// Минификация js кода
	// Перед минификацией директивы шаблонизатора заменяются на фейковые переменные с именем "match"+md5(директива)
	// После минификации осуществляется обратная замена фейковых переменных на директивы
	minify (codestring) {
		let result = codestring,
			re = /<%([^%>]+)?%>/g,
			map = {},
			match = null,
			hash = null;

		while (match = re.exec(codestring)) {
			hash = 'match' + crypto.createHash('md5').update(match[0]).digest('hex');
			result = result.replace(match[0], hash);
			map[hash] = match[0];
		}

		result = uglifyjs.minify(result, {
			fromString: true,
			compress  : {
				drop_console: false
			}
		});

		result = result.code;

		for (let i in map) {
			result = result.split(i).join(map[i]);
		}

		return result
	}


	// Скомпилировать шаблон
	compileFile (tmplname, cb) {
		tmplname     = path.resolve(this.options.root, tmplname);
		let hash     = path.relative(this.options.root, tmplname);
		let compiled = this.cache.getCompiled(hash);

		if (! compiled) {
			this.log('MJS: [%s] compile', hash);

			try {
				let sourceText = this.read(hash);
				let ts         = Date.now();

				if (this.options.compress) {
					if (reCss.test(hash)) {
						compiled = uglifycss.processString(sourceText);
					} else {
						compiled = this.minify(sourceText);
					}
				} else {
					compiled = sourceText;
				}

				let compressFactor = Math.round(compiled.length / sourceText.length * 100);
				let compressTime   = Date.now() - ts;
				this.log(`MJS: [${hash}] ${sourceText.length} -> ${compiled.length}, ${compressFactor}%, ${compressTime}ms`);
				compiled = ejs.compile(compiled);
			} catch (err) {
				return cb(err);
			}
			this.cache.setCompiled(hash, compiled);
		}

		cb(null, compiled);
	}

	// Отрендерить шаблон с данными
	renderFile (tmplname, data, cb) {
		tmplname = path.resolve(this.options.root, tmplname);
		let dataCopy = _.cloneDeep(data);
		// console.time(tmplname)
		this.compileFile(tmplname, (err, compiled) => {
			// console.timeEnd(tmplname)
			if (err) return cb(err);
			cb(null, compiled(dataCopy));
		})
	}
}

class Cache {
	constructor () {
		this.sourceCache    = {};
		this.compiledCache  = {};
		this.cacheRelations = {};
	}
	// получить исходный текст шаблона
	getSourceText (hash) {
		return this.sourceCache[hash];
	}
	// получить исходный текст шаблона
	setSourceText (hash, text) {
		this.sourceCache[hash] = text;
	}
	// получить скомпилированную функцию
	getCompiled (hash) {
		return this.compiledCache[hash];
	}
	// записать скомпилированную функцию
	setCompiled (hash, compiled) {
		this.compiledCache[hash] = compiled;
	}
	// Очистить кэш шаблона по его имени
	clearOne (hash) {
		delete this.sourceCache[hash];
		delete this.compiledCache[hash];
		this.clearRelation(hash);
	}
	clearAll () {
		for (let hash in this.sourceCache) {
			this.clearOne(hash);
		}
	}
	// Очистить все связанные шаблоны и их кэш
	clearRelation (hash) {
		(this.cacheRelations[hash] || []).forEach(parent => {
			delete this.compiledCache[parent];
			this.clearRelation(parent);
		})
	}
	// Добавить связь одного шаблона с другим
	addRelation (child, parent) {
		this.cacheRelations[child] = this.cacheRelations[child] || [];

		if (this.cacheRelations[child].indexOf(parent) == -1) {
			this.cacheRelations[child].push(parent);
		}
	}
}

module.exports = Mjs;