"use strict";
define(["underscore", "q", "mdcore", "../root"], function (_, Q, System, EventStore) {
    EventStore.namespace("EventStore");
    EventStore.Commit = (function () {
        function Commit(streamId, streamRevision, commitId, commitSequence, commitStamp, headers, events) {
            if (commitStamp && !_(commitStamp).isDate()) {
                throw new Error('commitStamp must be a date');
            }

            if (headers && !_(headers).isObject()) {
                throw new Error('headers must be a object');
            }

            if (events && !_(events).isArray()) {
                throw new Error('events must be an array');
            }

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
                commitId: {
                    value: commitId,
                    writable: false,
                    enumerable: true,
                    configurable: false
                },
                commitStamp: {
                    value: commitStamp,
                    writable: false,
                    enumerable: true,
                    configurable: false
                },
                commitSequence: {
                    value: commitSequence,
                    writable: false,
                    enumerable: true,
                    configurable: false
                },
                headers: {
                    value: headers || {},
                    writable: false,
                    enumerable: true,
                    configurable: false
                },
                events: {
                    value: events || [],
                    writable: false,
                    enumerable: true,
                    configurable: false
                }
            });
        }

        Commit.prototype.isValid = function () {
            if (_(this).isNull() || _(this).isUndefined())
            {
                throw new Error("attempt must be provided");
            }

            if (!this.streamId || !this.commitId)
            {
                throw new Error('The commit must be uniquely identified.');
            }

            if (this.commitSequence <= 0)
            {
                throw new Error('The commit sequence must be a positive number.');
            }

            if (this.streamRevision <= 0)
            {
                throw new Error('The stream revision must be a positive number.');
            }

            if (this.streamRevision < this.commitSequence)
            {
                throw new Error('The stream revision must always be greater than or equal to the commit sequence.');
            }

            return true;
        };

        Commit.prototype.isEmpty = function () {
            if (_(this).isUndefined()) {return true;}
            if (_(this).isNull()) {return true;}
            return this.events.length === 0;
        };

        return Commit;
    }());
});