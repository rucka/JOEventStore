var EventStore = require('../main.js');
var _ = require('underscore');
var Q = require('q');

this.LoadModule = (function () {
    "use strict";
    return {
        "configured EventStore": function (test) {
            test.expect(1);
            test.ok(EventStore);
            test.done();
        },
        "configured global functions": function (test) {
            test.expect(3);
            test.ok(_);
            test.ok(_.str);
            test.ok(Q);
            test.done();
        }
    };
}());