'use strict';
var _ = require('lodash');

/**
 * The plugin store
 * This is used to store plugin (npm packages) reference and instantiate them when
 * requested.
 * @constructor
 * @private
 */

var Store = module.exports = function Store() {
  this._plugins = {};
  this._meta = {};
};

/**
 * Store a module under the namespace key
 * @param {String}          namespace - The key under which the plugin can be retrieved
 * @param {String|Function} plugin - A plugin module or a module path
 */

Store.prototype.add = function add(namespace, plugin) {
  if (_.isString(plugin)) {
    this._storeAsPath(namespace, plugin);
    return;
  }

  this._storeAsModule(namespace, plugin);
};

Store.prototype._storeAsPath = function _storeAsPath(namespace, path) {
  this._meta[namespace] = {
    resolved: path,
    namespace: namespace
  };

  Object.defineProperty(this._plugins, namespace, {
    get: function () {
      var plugin = require(path);
      return plugin;
    },
    enumerable: true,
    configurable: true
  });
};

Store.prototype._storeAsModule = function _storeAsModule(namespace, plugin) {
  this._meta[namespace] = {
    resolved: 'unknown',
    namespace: namespace
  };

  this._plugins[namespace] = plugin;
};

/**
 * Get the module registered under the given namespace
 * @param  {String} namespace
 * @return {Module}
 */

Store.prototype.get = function get(namespace) {
  var plugin = this._plugins[namespace];

  if (!plugin) {
    return;
  }

  return _.extend(plugin, this._meta[namespace]);
};

/**
 * Returns the list of registered namespace.
 * @return {Array} Namespaces array
 */

Store.prototype.namespaces = function namespaces() {
  return Object.keys(this._plugins);
};

/**
 * Get the stored plugins meta data
 * @return {Object} plugins metadata
 */

Store.prototype.getpluginsMeta = function getpluginsMeta() {
  return this._meta;
};
