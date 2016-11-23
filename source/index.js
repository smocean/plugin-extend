'use strict';

if (!global._babelPolyfill) {
    require('babel-polyfill');
}
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const globby = require('globby');
const Store = require('./store');
const os = require('os');
const home = _.isFunction(os.homedir) ? os.homedir() : homedir();

function homedir() {
    var env = process.env;
    var home = env.HOME;
    var user = env.LOGNAME || env.USER || env.LNAME || env.USERNAME;

    if (process.platform === 'win32') {
        return env.USERPROFILE || env.HOMEDRIVE + env.HOMEPATH || home || null;
    }

    if (process.platform === 'darwin') {
        return home || (user ? '/Users/' + user : null);
    }

    if (process.platform === 'linux') {
        return home || (process.getuid() === 0 ? '/root' : (user ? '/home/' + user : null));
    }

    return home || null;
}

function untildify(str) {
    if (!_.isString(str)) {
        throw new Error(`Expected a string, got ${typeof str}`);
    }
    return home ? str.replace(/^~($|\/|\\)/, `${home}$1`) : str;
}

var escapeStrRe = require('escape-string-regexp');

const win32 = process.platform == 'win32';

class Resolver {
    constructor(opts) {
        this.lookups = ['.'].concat(opts.lookups || []);
        this.prefix = opts.prefix || 'plugin';
        // this.entryDir = opts.entryDir || 'app';
        this.store = new Store();
        this.aliases = [];
        //this.alias(/^([^:]+)$/, `$1:${this.entryDir}`);
    }
    lookup(callback) {
        let pluginModules = this.findPluginsIn(this.getNpmPaths());
        let patterns = [];

        this.lookups.forEach((lookup) => {
            pluginModules.forEach((modulePath) => {
                patterns.push(path.join(modulePath, lookup));
            });
        });

        patterns.forEach((pattern) => {
            globby.sync('*/index.js', {
                cwd: pattern
            }).forEach((filename) => {
                this._tryRegistering(path.join(pattern, filename));
            }, this);
        }, this);
        typeof callback == 'function' && callback(this.store.namespaces());
        return this.store.namespaces();
    }
    getNpmPaths() {
        let paths = [];

        if (process.env.NVM_PATH) {
            paths.push(path.join(path.dirname(process.env.NVM_PATH), 'node_modules'));
        }

        if (process.env.NODE_PATH) {
            paths = _.compact(process.env.NODE_PATH.split(path.delimiter)).concat(paths);
        }

        if (process.env['_']) {
            paths = _.compact(process.env['_'].split(path.delimiter)).concat(paths);
        }

        paths.push(path.join(__dirname, '../../../..'));
        paths.push(path.join(__dirname, '../..'));

        if (process.argv[1]) {
            paths.push(path.join(path.dirname(process.argv[1]), '../..'));
        }

        if (win32) {
            paths.push(path.join(process.env.APPDATA, 'npm/node_modules'));
        } else {
            paths.push('/usr/lib/node_modules');
        }
        process.cwd().split(path.sep).forEach(function (part, i, parts) {
            var lookup = path.join.apply(path, parts.slice(0, i + 1).concat(['node_modules']));

            if (!win32) {
                lookup = '/' + lookup;
            }

            paths.push(lookup);
        });

        return paths.reverse();
    }

    findPluginsIn(searchPaths) {
        let modules = [],
            self = this;

        searchPaths.forEach((root) => {
            if (!root) {
                return;
            }
            modules = globby.sync([
                `${self.prefix}-*`,
                `@*/${self.prefix}-*`
            ], {
                cwd: root
            }).map((match) => {
                return path.join(root, match);
            }).concat(modules);
        });

        return modules;

    }

    _tryRegistering(pluginReference) {
        let namespace,
            realPath = fs.realpathSync(pluginReference);

        try {
            if (realPath != pluginReference) {
                namespace = this.namespace(pluginReference);
            }

            this.register(realPath, namespace);
        } catch (e) {
            console.error('Unable to register %s (Error: %s)', pluginReference, e.message);

        }
    }
    namespace(filepath) {
        if (!filepath) {
            throw new Error('Missing namespace');
        }

        // cleanup extension and normalize path for differents OS
        var ns = path.normalize(filepath.replace(new RegExp(escapeStrRe(path.extname(filepath)) + '$'), ''));

        // Sort lookups by length so biggest are removed first
        var lookups = _(this.lookups.concat(['..'])).map(path.normalize).sortBy('length').value().reverse();

        // if `ns` contains a lookup dir in its path, remove it.
        ns = lookups.reduce(function (ns, lookup) {
            // only match full directory (begin with leading slash or start of input, end with trailing slash)
            lookup = new RegExp('(?:\\\\|/|^)' + escapeStrRe(lookup) + '(?=\\\\|/)', 'g');
            return ns.replace(lookup, '');
        }, ns);

        var folders = ns.split(path.sep);
        var scope = _.findLast(folders, function (folder) {
            return folder.indexOf('@') === 0;
        });
        var prefixReg = new RegExp(`(.*${this.prefix}-)`);

        // cleanup `ns` from unwanted parts and then normalize slashes to `:`
        ns = ns
            .replace(prefixReg, '') // remove before `generator-`
            .replace(/[\/\\](index|main)$/, '') // remove `/index` or `/main`
            .replace(/^[\/\\]+/, '') // remove leading `/`
            .replace(/[\/\\]+/g, ':'); // replace slashes by `:`

        if (scope) {
            ns = scope + '/' + ns;
        }
        return ns;
    }
    register(name, namespace) {
        if (!_.isString(name)) {
            return this.error(new Error('You must provide a plugin name to register.'));
        }

        var modulePath = this.resolveModulePath(name);
        namespace = namespace || this.namespace(modulePath);

        if (!namespace) {
            return this.error(new Error('Unable to determine namespace.'));
        }

        this.store.add(namespace, modulePath);

        return this;
    }
    resolveModulePath(moduleId) {
        if (moduleId[0] === '.') {
            moduleId = path.resolve(moduleId);
        }
        if (path.extname(moduleId) === '') {
            moduleId += path.sep;
        }

        return require.resolve(untildify(moduleId));
    }
    getPlugin(namespace, force) {
        if (force || this.store.namespaces().length == 0) {
            this.lookup();
        }

        if (!namespace) {
            return;
        }

        var parts = namespace.split(':');
        var maybePath = _.last(parts);

        if (parts.length > 1 && /[\/\\]/.test(maybePath)) {
            parts.pop();

            // We also want to remove the drive letter on windows
            if (maybePath.indexOf('\\') >= 0 && _.last(parts).length === 1) {
                parts.pop();
            }

            namespace = parts.join(':');
        } else {

        }

        return this.store.get(namespace) ||
            this.store.get(this.alias(namespace));

    }

    alias(match, value) {
        if (match && value) {
            this.aliases.push({
                match: match instanceof RegExp ? match : new RegExp('^' + match + '$'),
                value: value
            });
            return this;
        }

        var aliases = this.aliases.slice(0).reverse();

        return aliases.reduce((res, alias) => {
            if (!alias.match.test(res)) {
                return res;
            }

            return res.replace(alias.match, alias.value);
        }, match);
    }
}

module.exports = Resolver;