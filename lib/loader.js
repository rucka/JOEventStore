"use strict";
define(function (require, exports, module) {
    var root = require('root');

    var _ = require('underscore');
    _.str = require('underscore.string');
    // Mix in non-conflict functions to Underscore namespace if you want
    _.mixin(_.str.exports());
    // All functions, include conflict, will be available through _.str object
    _.str.include('Underscore.string', 'string'); // => true

    var __filename = module.uri;
    var path = require('path');
    var __dirname = path.dirname(__filename);

    var wrench = require('wrench');
    var files = _.chain(wrench.readdirSyncRecursive(__dirname)).
        filter(function (file) {
            return (file !== 'loader.js' && file !== 'root.js' && _(file).endsWith('.js'));
        }).map(function (file) {
            return file.replace('.js', '').replace('\\', '/');
        }).value();
    _(files).each(function (name) {
        require(name);
    });
    return root;
});
