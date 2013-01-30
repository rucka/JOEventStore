"use strict";
define(["underscore", "q", "../root"], function (_, Q, System) {
    System.namespace("System.ComponentModel");

    var logger = System.ComponentModel.logger = {
        levels : ['debug','verbose', 'info', 'warn', 'err'],
        defaultLevel : 'info',
        filterLevels : 'all',
        filterComponents : 'all',
        filterCategories : 'all',
        active: true
    };

    logger.log = function (message, level, component, category, metadata) {
        if (!logger.active) {return;}
        if (logger.filterLevels !== 'all' && !_(logger.filterLevels).contains(level)) {
            return;
        }

        if (logger.filterComponents !== 'all' && !_(logger.filterComponents).contains(component)) {
            return;
        }

        if (logger.filterCategories !== 'all' && !_(logger.filterCategories).contains(category)) {
            return;
        }

        level = level === 'warning' ? 'warn' : level;
        level = level === 'error' ? 'err' : level;

        var date = new Date();
        var metadataString = _(metadata).isArray() ?
            '['+ metadata.join(',') + ']'
            : _(metadata).isString() ?
            '['+metadata + ']'
            : '';

        level = !_(logger.levels).contains(level) ?
            (!_(logger.levels).contains(logger.defaultLevel) ? 'info' : logger.defaultLevel) : level;

        var componentString = _(component).isString()?
            '[' + component + ']'
            : '';

        var categoryString = _(category).isString()?
            '['+ category + ']'
            : '';

        var msgtolog = '[' + date.toDateString() + ' ' + date.toLocaleTimeString() + '][' + level + ']' + componentString +categoryString + metadataString + message;
        if (level === 'warn') {
            console.warn(msgtolog);
        } else if (level === 'err') {
            console.error(msgtolog);
        } else {
            console.log(msgtolog);
        }
    };

    logger.debug = function (message, component, category, metadata) {
        logger.log(message, 'debug', metadata);
    };

    logger.verbose = function (message, component, category, metadata) {
        logger.log(message, 'verbose', metadata);
    };

    logger.info = function (message, component, category, metadata) {
        logger.log(message, 'info', metadata);
    };

    logger.warn = function (message, component, category, metadata) {
        logger.log(message, 'warn', metadata);
    };

    logger.err = function (message, component, category, metadata) {
        logger.log(message, 'err', metadata);
    };
});

