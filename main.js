"use strict";
require('mdcore');
var requireJs = require('requirejs');

requireJs.config({
    baseUrl: require('path').join(__dirname, 'lib'),
    nodeRequire: require
});

module.exports = requireJs('loader');