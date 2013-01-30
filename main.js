"use strict";
require('mdcore');
var requireJs = require('requirejs');

requireJs.config({
    baseUrl: __dirname + '/lib',
    nodeRequire: require
});

module.exports = requireJs('loader');