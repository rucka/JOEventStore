"use strict";
define(["underscore", "q", "mdcore", "../root"], function (_, Q, System, EventStore) {

    EventStore.EventStore = (function () {
        var serviceName = 'EventStore';

        var persistenceField = System.ComponentModel.PrivateName();
        var pipelineHooksField = System.ComponentModel.PrivateName();

        function EventStore_(persistence, pipelineHooks) {
            validateOptions(persistence, pipelineHooks);

            this[persistenceField] = persistence;

            if (!pipelineHooks) {
                this[pipelineHooksField] = [];
            } else {
                if (!_(pipelineHooks).isArray()) {throw new Error('pipeline hooks must be an array');}
                this[pipelineHooksField] = pipelineHooks;
            }
        }

        EventStore_.prototype.createStream = function (streamId) { //TODO: test me!!
            validateStreamId(streamId);

            logdebug("Creating stream {0}".replace('{0}', streamId));
            return new EventStore.EventStream(streamId, this);
        };

        EventStore_.prototype.openStream = function () {
            var parameters = translateStreamParameters.apply(this, arguments);
            var eventStream;
            if (!parameters.snapshot) {
                validateStreamId(parameters.streamId);

                logdebug("Opening stream '{0}' between revisions {1} and {2}.".
                    replace('{0}', parameters.streamId).
                    replace('{1}', parameters.minRevision).
                    replace('{2}', parameters.maxRevision));
                eventStream = new EventStore.EventStream(parameters.streamId, this, parameters.minRevision, parameters.maxRevision);
            } else {
                validateStreamId(parameters.snapshot.streamId);

                logdebug("Opening stream '{0}' with snapshot at {1} up to revision {2}.".
                    replace('{0}', parameters.snapshot.streamId).
                    replace('{1}', parameters.minRevision).
                    replace('{2}', parameters.maxRevision));
                eventStream = new EventStore.EventStream(parameters.snapshot, this, parameters.maxRevision);
            }
            return eventStream;
        };

        EventStore_.prototype.commit = function (attempt) { //TODO: test me!!
            if (attempt && (!attempt.isValid() || attempt.isEmpty()))
            {
                logdebug("Commit attempt failed one or more integrity checks.");
                return;
            }
            var that = this;
            var pipelineHooks = that[pipelineHooksField];
            var persistence = that[persistenceField];

            var index;
            for (index in pipelineHooks) {
                var hook = pipelineHooks[index];
                var hooktype = hook.getType ? hook.getType() : 'hook';
                logdebug("Pushing commit '{0}' to pre-commit hook of type '{1}'.".
                    replace('{0}', attempt.commitId).
                    replace('{1}', hooktype));

                if (!hook.preCommit(attempt)){
                    log("Pipeline hook of type '{0}' rejected attempt '{1}'.".
                        replace('{0}', hooktype).
                        replace('{1}', attempt.commitId));
                    return;
                }
            }

            log("Committing attempt '{0}' which contains {1} events to the underlying persistence engine.".
                replace('{0}', attempt.commitId).
                replace('{1}', attempt.events.length));

            var deferred = Q.defer();
            persistence.commit(attempt).done(function() {
                var funcs = [];

                _(pipelineHooks).each(function(hook){
                    funcs.push(createExecutePipelineHook(attempt, hook));
                });

                funcs.reduce(function (soFar, f) {
                    return soFar.then(f);
                }, Q.resolve()).
                    then(function (args) {
                        deferred.resolve(args);
                    }).
                    fail(function (e) {
                        deferred.reject(e);
                    });
            }).fail(deferred.reject);
            return createPromiseService.call(this, deferred.promise);
        };

        function createExecutePipelineHook(attempt, hook){
            var hooktype = hook.getType ? hook.getType() : 'hook';
            return function() {
                var deferred = Q.defer();
                try {
                    logdebug("Pushing commit '{0}' to post-commit hook of type '{1}'.".
                        replace('{0}', hooktype).
                        replace('{1}', attempt.commitId));
                    var result = hook.postCommit(attempt);
                    if (isPromiseService(result)) {
                        result.done(function(args){
                            deferred.resolve(args);
                        }).
                        fail(deferred.reject);
                    } else {
                        deferred.resolve();
                    }
                } catch (e) {
                    deferred.reject(e);
                }
                return deferred.promise;
            };
        }

        function isPromiseService (result) {
            return result && result.done;
        }

        EventStore_.prototype.getFrom = function (streamId, minRevision, maxRevision) { //TODO: test me!!
            var filtered;
            var that = this;
            var persistence = that[persistenceField];

            validateStreamId(streamId);

            var deferred = Q.defer();
            persistence.getFrom(streamId, minRevision, maxRevision).
                done(function (commits){
                    var filteredList = [];
                    _(commits).each(function (commit){
                        filtered = commit;
                        var skippedCommit;

                        _.chain(that[pipelineHooksField]).
                            filter(function(p){
                                return (filtered = p.select(commit)) === undefined;
                            }).
                            each(function(p){
                                if (skippedCommit){return;}
                                log("Pipeline hook of type '{0}' skipped over commit '{1}'.".
                                    replace('{0}', p.getType()).
                                    replace('{1}', commit.commitId));
                                skippedCommit = true;
                            })
                        ;
                        if (_(filtered).isUndefined()) {
                            log("One or more pipeline hooks filtered out the commit.");
                        } else {
                            filteredList.push(filtered);
                        }
                    });
                    deferred.resolve(filteredList);
                }).fail(deferred.reject);

            return createPromiseService.call(that, deferred.promise);
        };

        EventStore_.prototype.advanced = function () {
            return this[persistenceField];
        };

        function createPromiseService(promise){
            var that = this;
            var builder = new System.ComponentModel.PromiseServiceBuilder({
                serviceName : serviceName,
                startupMethods : {
                    open : function () {
                        return promise;
                    }
                },services : {
                    createStream : function() {return toPromise(EventStore_.prototype.createStream.apply(that, arguments));},
                    openStream : function() {return toPromise(EventStore_.prototype.openStream.apply(that, arguments));},
                    commit : function() {return toPromise(EventStore_.prototype.commit.apply(that, arguments));},
                    getFrom : function() {return toPromise(EventStore_.prototype.getFrom.apply(that, arguments));},
                    advanced : function() {return toPromise(EventStore_.prototype.advanced.apply(that, arguments));}
                }
            });
            return builder.build().open();
        }

        function toPromise(promiseService) {
            var deferred = Q.defer();
            promiseService.done(deferred.resolve).fail(deferred.reject);
            return deferred.promise;
        }

        function translateStreamParameters(){
            if (arguments.length === 0) {
                throw new Error('Expected at least one parameter');
            }

            var returned = {};

            if (EventStore.Snapshot.isSnapshot(arguments[0])) {
                returned.snapshot = arguments[0];
                returned.streamid = returned.snapshot.streamId;
                returned.maxRevision = Number.MAX_VALUE;
                if (_(arguments[1]).isNumber()) {
                    returned.maxRevision = arguments[1] <= 0 ? Number.MAX_VALUE : arguments[1];
                }
            } else {
                returned.streamId = arguments[0];
                returned.minRevision = -Number.MAX_VALUE;
                returned.maxRevision = Number.MAX_VALUE;

                if (_(arguments[1]).isNumber()) {
                    returned.minRevision = arguments[1];
                }

                if (_(arguments[2]).isNumber()) {
                    returned.maxRevision = arguments[2] <= 0 ? Number.MAX_VALUE : arguments[2];
                }
            }
            return returned;
        }

        function validateStreamId(streamId) {
            var pattern1 = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
            var pattern2 = /^\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}‌​\}?$/;

            if (pattern1.test(streamId) || pattern2.test(streamId)) {
                return;
            }
            throw new Error("Invalid stream id " + streamId + " : it must be a guid");
        }

        function validateOptions (persistence, pipelineHooks) {
            System.ComponentModel.Object.prototype.ensureHasMethods(persistence, "persistence", ['getSnapshot', 'addSnapshot', 'getStreamsToSnapshot', 'getFrom', 'commit', 'initialize', 'getUndispatchedCommits', 'markCommitAsDispatched', 'purge']);

            if (pipelineHooks && !_(pipelineHooks).isArray()) {
                throw new Error('pipelineHooks must be an array');
            }

            _(pipelineHooks).each (function(value, index){
                System.ComponentModel.Object.prototype.ensureHasMethods(value, "EventStore options pipelineHooks[" + index + "]", ['select', 'preCommit', 'postCommit']);
            });
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

        return EventStore_;
    }());
});