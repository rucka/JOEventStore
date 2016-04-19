"use strict";
define(["underscore", "q", "mdcore", "../root"], function (_, Q, System, EventStore) {
    EventStore.namespace("EventStore.Dispatcher");
    EventStore.Dispatcher.AsynchronousDispatchScheduler = (function () {

        var serviceName = 'AsynchronousDispatchScheduler';

        var dispatcherField = System.ComponentModel.PrivateName();
        var persistenceField = System.ComponentModel.PrivateName();

        function AsynchronousDispatchScheduler(dispatcher, persistence) {
            System.ComponentModel.Object.prototype.ensureHasMethods(dispatcher, "dispatcher", ['dispatch']);
            System.ComponentModel.Object.prototype.ensureHasMethods(persistence, "persistence", ['getSnapshot', 'addSnapshot', 'getStreamsToSnapshot', 'getFrom', 'commit', 'initialize', 'getUndispatchedCommits', 'markCommitAsDispatched', 'purge']);
            this[dispatcherField] = dispatcher;
            this[persistenceField] = persistence;

            log("Starting dispatch scheduler.");

            var deferred = Q.defer();
            var result;
            var that = this;

            try {
                logdebug("Initializing persistence engine.");
                result = persistence.initialize();
            } catch (exInit) {
                deferred.reject(exInit);
                return createPromiseService.call(this, deferred.promise);
            }

            try {
                result = isPromiseService(result) ? result.done().getUndispatchedCommits() :  persistence.getUndispatchedCommits();
            } catch (exGetUndispatched) {
                deferred.reject(exGetUndispatched);
                return createPromiseService(deferred.promise);
            }

            if (!result) {
                deferred.reject(new Error ('Expected getUndispatchedCommits returns something'));
                return createPromiseService(deferred.promise);
            }

            if (_(result).isArray()) {
                var funcs = _(result).map(function (commit) {
                    return function () {
                        return scheduleDispatchPromise.call(that, commit);
                    };
                });

                funcs.reduce(function (soFar, f) {
                    return soFar.then(f);
                }, Q.resolve()).
                    then(function (){deferred.resolve(that);}).
                    fail(deferred.reject);

                return createPromiseService(deferred.promise);
            }

            if (!isPromiseService(result)) {
                deferred.reject(new Error ('Expected getUndispatchedCommits returns an array or promiseService'));
                return createPromiseService(deferred.promise);
            }

            result.done(function (commits){
                    var funcs = _(commits).map(function (commit) {
                        return function () {
                            return scheduleDispatchPromise.call(that, commit);
                        };
                    });

                    funcs.reduce(function (soFar, f) {
                        return soFar.then(f);
                    }, Q.resolve()).
                        then(function (){deferred.resolve(that);}).
                        fail(deferred.reject);
                }).
                fail(deferred.reject);

            return createPromiseService(deferred.promise);
        }

        function isPromiseService (result) {
            return result && result.done;
        }

        function createPromiseService(promise){
            var that = this;
            var builder = new System.ComponentModel.PromiseServiceBuilder({
                serviceName : serviceName,
                startupMethods : {
                    open : function () {
                        return promise;
                    }
                },services : {
                    scheduleDispatch : function() {return scheduleDispatchPromise.apply(that, arguments);}
                }
            });
            return builder.build().open();
        }

        function scheduleDispatchPromise(commit) {
            log("Scheduling commit '{0}' for delivery.".replace("{0}", commit.commitId));

            var deferred = Q.defer();
            var that = this;
            var dispatcher = that[dispatcherField];
            var persistence = that[persistenceField];

            var dispatcherMessageError = "Configured dispatcher of type '{0}' was unable to dispatch commit '{1}'.".
                replace("{0}", (dispatcher.getType ? dispatcher.getType() : 'dispatcher')).
                replace("{1}", commit.commitId);

            try {
                log("Scheduling commit '{0}' to be dispatched.".replace("{0}", commit.commitId));
                var result = dispatcher.dispatch(commit);

                if (isPromiseService(result)) {
                    result.done(function () {
                        markCommitAsDispatched.call(that, commit).
                            then(deferred.resolve).fail(deferred.reject);
                    }).fail(function (err) {
                        logerror(dispatcherMessageError + '. Message {1}'.replace("{0}", err.message));
                        deferred.reject(err);
                    });
                    return deferred.promise;
                }

                markCommitAsDispatched.call(that, commit).
                    then(deferred.resolve).fail(deferred.reject);

            } catch (e) {
                logerror(dispatcherMessageError + '. Message {1}'.replace("{0}", e.message));
                deferred.reject(e);
            }

            return deferred.promise;
        }

        function markCommitAsDispatched(commit) {
            var that = this;
            var persistence = that[persistenceField];

            log("Marking commit '{0}' as dispatched.".replace("{0}", commit.commitId));
            var result = persistence.markCommitAsDispatched(commit);
            if (isPromiseService(result)) {
                return result.promise;
            }
            return Q.resolve();
        }

        AsynchronousDispatchScheduler.prototype.scheduleDispatch = function (commit) {
            return createPromiseService(scheduleDispatchPromise.call(this, commit));
        };

        AsynchronousDispatchScheduler.prototype.getType = function () {
            return serviceName;
        };

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

        return AsynchronousDispatchScheduler;
    }());
});