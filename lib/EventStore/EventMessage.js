"use strict";
define(["underscore", "q", "mdcore", "../root"], function (_, Q, System, EventStore) {
    EventStore.namespace("EventStore");
    EventStore.EventMessage = (function () {
        function EventMessage(options) {
            options = options || {};
            Object.defineProperties(this,{
                headers: {
                    value: {},
                    writable: false,
                    enumerable: true,
                    configurable: false
                },
                body: {
                    value: options.body,
                    writable: true,
                    enumerable: true,
                    configurable: false
                }
            });
        }

        return EventMessage;
    }());
});