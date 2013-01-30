"use strict";
define(["underscore", "q", "mdcore", "../root"], function (_, Q, System, EventStore) {
    EventStore.namespace("EventStore");
    EventStore.EventStream = (function () {
        var serviceName = 'EventStream';

        var streamIdField = System.ComponentModel.PrivateName();
        var streamRevisionField = System.ComponentModel.PrivateName();
        var commitSequenceField = System.ComponentModel.PrivateName();

        var persistenceField = System.ComponentModel.PrivateName();
        var committedField = System.ComponentModel.PrivateName();
        var eventsField = System.ComponentModel.PrivateName();

        var uncommittedHeadersField = System.ComponentModel.PrivateName();
        var committedHeadersField = System.ComponentModel.PrivateName();
        var identifiersField = System.ComponentModel.PrivateName();

        function EventStream() {
            var parameters = translateStreamParameters.apply(this, arguments);

            this[persistenceField] = parameters.persistence;
            this[streamIdField] = parameters.streamId || parameters.snapshot.streamId;
            this[streamRevisionField] = 0;
            this[commitSequenceField] = 0;
            this[committedField] = [];
            this[eventsField] = [];
            this[identifiersField] = [];
            this[uncommittedHeadersField] = {};
            this[committedHeadersField] = {};

            validateStreamId(this[streamIdField]);

            Object.defineProperties(this,{
                streamId: {
                    get: function(){return this[streamIdField];},
                    enumerable: true,
                    configurable: false
                },
                streamRevision : {
                    get: function(){return this[streamRevisionField];},
                    enumerable: true,
                    configurable: false
                },
                commitSequence : {
                    get: function(){return this[commitSequenceField];},
                    enumerable: true,
                    configurable: false
                }
            });

            if (arguments.length === 2) {
                return;
            }

            var persistence = this[persistenceField];
            var streamId = this[streamIdField];
            var minRevision = parameters.snapshot ? parameters.snapshot.streamRevision : parameters.minRevision;

            var that = this;

            var deferred = Q.defer();
            persistence.getFrom(streamId, minRevision, parameters.maxRevision).
                done(function (commits) {
                    if (parameters.snapshot) {
                        var snapshot = parameters.snapshot;
                        populateStream.call(that, snapshot.streamRevision + 1, parameters.maxRevision, commits);
                        that[streamRevisionField] = snapshot.streamRevision + that[committedField].length;
                    } else {
                        populateStream.call(that, parameters.minRevision, parameters.maxRevision, commits);
                        if (parameters.minRevision > 0 && that[committedField].length === 0) {
                            throw new Error('Stream ' + streamId + ' not found.');
                        }
                    }
                    deferred.resolve(that);
                }).fail(deferred.reject);

            return createPromiseService.call(this, deferred.promise);
        }

        function populateStream(minRevision, maxRevision, commits) {
           var that = this;
            var i;
            commits = commits || [];

            for (i = 0; i < commits.length; i++) {
                var commit = commits[i];
                logverbose("Adding commit '{0} with {1} events to stream '{2}'.".
                    replace("{0}", commit.commitId).
                    replace("{1}", commit.events.length).
                    replace("{2}", that.streamId)
                );
                that[identifiersField].push(commit.commitId);
                that[commitSequenceField] = commit.commitSequence;

                var currentRevision = commit.streamRevision - commit.events.length + 1;
                if (currentRevision > maxRevision) {return;}

                copyToCommittedHeaders.call(that, commit);
                copyToEvents.call(that, minRevision, maxRevision, currentRevision, commit);
            }
        }

        function copyToCommittedHeaders(commit){
            var that = this;
            _(commit.headers).each(function (value, key) {
                that[committedHeadersField][key] = commit.headers[key];
            });
        }

        function copyToEvents(minRevision, maxRevision, currentRevision, commit){
            var i, event;
            var that = this;
            for (i = 0; i < commit.events.length; i++) {
                event = commit.events[i];
                if (currentRevision > maxRevision) {
                    logdebug("Ignoring some events on commit '{0}' of stream '{1}' because they go beyond revision {2}.".
                        replace("{0}", commit.commitId).
                        replace("{1}", that.streamId).
                        replace("{2}", maxRevision)
                    );
                    break;
                }
                if (currentRevision++ < minRevision) {
                    logdebug("Ignoring some events on commit '{0}' of stream '{1}' because they starting before revision {2}.".
                        replace("{0}", commit.commitId).
                        replace("{1}", that.streamId).
                        replace("{2}", maxRevision)
                    );
                    continue;
                }
                that[committedField].push(event);
                that[streamRevisionField] = currentRevision - 1;
            }
        }

        function createPromiseService(promise){
            var that = this;
            var builder = new System.ComponentModel.PromiseServiceBuilder({
                serviceName : serviceName,
                startupMethods : {
                    open : function () {
                        return promise;
                    }
                },
                services : {
                    streamId : function() {return EventStream.prototype.streamId.apply(that, arguments);},
                    streamRevision : function() {return EventStream.prototype.streamRevision.apply(that, arguments);},
                    commitSequence : function() {return EventStream.prototype.commitSequence.apply(that, arguments);},
                    committedEvents : function() {return EventStream.prototype.committedEvents.apply(that, arguments);},
                    committedHeaders : function() {return EventStream.prototype.committedHeaders.apply(that, arguments);},
                    uncommittedEvents : function() {return EventStream.prototype.uncommittedEvents.apply(that, arguments);},
                    uncommittedHeaders : function() {return EventStream.prototype.uncommittedHeaders.apply(that, arguments);},
                    add : function() {return EventStream.prototype.add.apply(that, arguments);},
                    commitChanges : function() {return EventStream.prototype.commitChanges.apply(that, arguments);},
                    clearChanges : function() {return EventStream.prototype.clearChanges.apply(that, arguments);}
                }
            });
           return builder.build().open();
        }

        EventStream.prototype.committedEvents = function () {return _(this[committedField]).clone();};
        EventStream.prototype.committedHeaders = function () {return _(this[committedHeadersField]).clone();};

        EventStream.prototype.uncommittedEvents = function () {return _(this[eventsField]).clone();};
        EventStream.prototype.uncommittedHeaders = function () {return _(this[uncommittedHeadersField]).clone();};

        EventStream.prototype.add = function (uncommittedEvent) {
            if (!uncommittedEvent || !uncommittedEvent.body)
            {
                return;
            }
            logdebug("Appending uncommitted event to stream '{0}'".replace('{0}', this[streamIdField]));
            this[eventsField].push(uncommittedEvent);
        };

        EventStream.prototype.commitChanges  = function (commitId) {
            var that = this;
            var streamId = that[streamIdField];

            validateStreamId(streamId);
            validateCommitId(commitId);

            logdebug("Attempting to commit all changes on stream '{0}' to the underlying store.".replace('{0}', streamId));
            var identifiers = that[identifiersField];
            if (_(identifiers).contains(commitId)) {
                throw new Error('Duplicate commit id ' + commitId);
            }

            if (!hasChanges.call(this)) {
                return;
            }

            var persistence = that[persistenceField];

            var attempt = buildCommitAttempt.call(this, commitId);
            logdebug("Pushing attempt '{0}' on stream '{1}' to the underlying store.".
                replace('{0}', commitId).
                replace('{1}', streamId));

            var deferred = Q.defer();
            persistence.commit(attempt).
                done(function (){
                    populateStream.call(that, that[streamRevisionField] + 1, attempt.streamRevision, [attempt]);
                    that.clearChanges();
                    deferred.resolve();
                }).
                fail(function (e){ //TODO: test me!!
                    if (e && e.getType && e.getType() === 'ConcurrencyError') {
                        log("The underlying stream '{0}' has changed since the last known commit, refreshing the stream.".replace('{0}', streamId));
                        persistence.
                            getFrom(that[streamIdField], that[streamRevisionField] + 1, Number.MAX_VALUE).
                            done(function(commits){
                                populateStream.call(that, that[streamRevisionField] + 1, Number.MAX_VALUE, commits);
                                deferred.reject(e);
                            }).fail(deferred.reject);
                        return;
                    }
                    deferred.reject(e);
                });
            return createPromiseService.call(this, deferred.promise);
        };

        function buildCommitAttempt(commitId) {
            validateCommitId(commitId);

            logdebug("Building a commit attempt '{0}' on stream '{1}'.".
                replace("{0}", commitId).
                replace("{1}", this[streamIdField]));

            var now = new Date();
            var utc_timestamp = new Date(Date.UTC(now.getFullYear(),now.getMonth(), now.getDate() ,
                now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()));

            return new EventStore.Commit(
                this[streamIdField],
                this[streamRevisionField] + this[eventsField].length,
                commitId,
                this[commitSequenceField] + 1,
                utc_timestamp,
                _(this[uncommittedHeadersField]).clone(),
                _(this[eventsField]).clone());
        }

        function hasChanges() {
            if (this[eventsField].length > 0)
            {
                return true;
            }

            logwarn("There are no outstanding changes to be committed stream '{0}'.".replace('{0}', this[streamIdField]));
            return false;
        }

        EventStream.prototype.clearChanges = function () {
            logdebug("Clearing all uncommitted changes on stream '{0}'.".replace('{0}', this[streamIdField]));
            this[eventsField] = [];
            this[uncommittedHeadersField] = {};
        };

        function translateStreamParameters() {
            if (arguments.length < 2) {
                throw new Error('Expected at least two parameters');
            }

            System.ComponentModel.Object.prototype.ensureHasMethods(arguments[1], "persistence", ['getFrom', 'commit']);

            if (arguments.length === 2 && parameters.snapshot) {
                throw new Error('Cannot provide only snapshoshot and persistence');
            }

            var returned = {};
            returned.persistence = arguments[1];

            if (EventStore.Snapshot.isSnapshot(arguments[0])) {
                returned.snapshot = arguments[0];
                returned.minRevision = returned.snapshot.streamRevision;
                returned.maxRevision = arguments[2];
            } else {
                returned.streamId = arguments[0];
                returned.minRevision = arguments[2];
                returned.maxRevision = arguments[3];
            }

            return returned;
        }

        function validateStreamId(streamId) {
            if (guidIsValid(streamId)) {
                return;
            }
            throw new Error("Invalid stream id " + streamId + " : it must be a guid");
        }

        function validateCommitId(commitId) {
            if (guidIsValid(commitId)) {
                return;
            }
            throw new Error("Invalid commit id " + commitId + " : it must be a guid");
        }
        function guidIsValid(guid) {
            var pattern1 = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
            var pattern2 = /^\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}‌​\}?$/;

            return (pattern1.test(guid) || pattern2.test(guid));
        }

        function log (message, level, category, metadata) {
            System.ComponentModel.logger.log(message, level, serviceName, category, metadata);
        }

        function logdebug (message, category, metadata) {
            System.ComponentModel.logger.log(message, 'debug', serviceName, category, metadata);
        }

        function logverbose (message, category, metadata) {
            System.ComponentModel.logger.log(message, 'verbose', serviceName, category, metadata);
        }

        function logwarn (message, category, metadata) {
            System.ComponentModel.logger.log(message, 'warn', serviceName, category, metadata);
        }

        function logerror (message, category, metadata) {
            System.ComponentModel.logger.log(message, 'err', serviceName, category, metadata);
        }
        return EventStream;
    }());
});