"use strict";
define(["underscore", "q", "mdcore", "../root"], function (_, Q, System, EventStore) {
    EventStore.namespace("EventStore");
    EventStore.Snapshot = (function () {

        function Snapshot(streamId, streamRevision, payload, typename) {
            Object.defineProperties(this,{
                streamId: {
                    value: streamId,
                    writable: false,
                    enumerable: true,
                    configurable: false
                },
                streamRevision: {
                    value: streamRevision,
                    writable: false,
                    enumerable: true,
                    configurable: false
                },
                payload: {
                    value: payload,
                    writable: false,
                    enumerable: true,
                    configurable: false
                }
            });
            if (typename) {
                this.getType = function () {
                    return typename;
                }
            }
        }

        Snapshot.isSnapshot = function (item) {
            if (!item) {
                throw new Error('item undefined');
            }

            return item.streamId && item.streamRevision && item.payload;
        };

        return Snapshot;
    }());
});