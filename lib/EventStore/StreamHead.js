"use strict";
define(["underscore", "q", "mdcore", "../root"], function (_, Q, System, EventStore) {
    EventStore.namespace("EventStore");
    EventStore.StreamHead = (function () {

        function StreamHead(streamId, headRevision, streamRevision) {
            Object.defineProperties(this,{
                streamId: {
                    value: streamId,
                    writable: false,
                    enumerable: true,
                    configurable: false
                },
                headRevision: {
                    value: headRevision,
                    writable: false,
                    enumerable: true,
                    configurable: false
                },
                streamRevision: {
                    value: streamRevision,
                    writable: false,
                    enumerable: true,
                    configurable: false
                }
            });
        }

        return StreamHead;
    }());
});