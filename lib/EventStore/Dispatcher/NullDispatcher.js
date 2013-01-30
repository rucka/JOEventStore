"use strict";
define(["underscore", "q", "mdcore", "../root"], function (_, Q, System, EventStore) {
    EventStore.namespace("EventStore.Dispatcher");
    EventStore.Dispatcher.NullDispatcher = (function () {

        function NullDispatcher() {

        }

        NullDispatcher.prototype.dispatch = function (commit) {};
        NullDispatcher.prototype.scheduleDispatch = function (commit) {this.dispatch(commit);};

        return NullDispatcher;
    }());
});