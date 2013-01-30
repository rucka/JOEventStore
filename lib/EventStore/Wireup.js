"use strict";
define(["underscore", "q", "mdcore", "../root"], function (_, Q, System, EventStore) {
    EventStore.namespace("EventStore");
    EventStore.Wireup = (function () {
        var optionsName = System.ComponentModel.PrivateName();

        function Wireup (config) {
            this[optionsName] = config;
        }

        Wireup.prototype.usingMongoPersistence = function (connectionString) {
            var o = this[optionsName];
            o.persistence = new EventStore.Persistence.MongoPersistenceEngine(connectionString);
            return this;
        };

        Wireup.prototype.hookIntoPipelineUsing = function () {
            var o = this[optionsName];
            o.pipelineHooks = _(arguments).map(function (item){
                return item;
            });
            return this;
        };

        Wireup.prototype.usingAsynchronousDispatchScheduler = function(dispatcher) {
            var o = this[optionsName];
            dispatcher = dispatcher || new EventStore.Dispatcher.NullDispatcher();
            System.ComponentModel.Object.prototype.ensureHasMethods(dispatcher, "dispatcher", ['dispatch']);

            o.scheduleDispatchesFactory = function () {
                return new EventStore.Dispatcher.AsynchronousDispatchScheduler(dispatcher, o.persistence);
            };
            var that = this;

            return {
                dispatchTo : function (d) {
                    o.scheduleDispatchesFactory = function(){
                        return new EventStore.Dispatcher.AsynchronousDispatchScheduler(d, o.persistence);
                    };
                    return that;
                }
            };
        };

        Wireup.prototype.build = function () {
            var o = this[optionsName];
            var hooks = o.pipelineHooks && _(o.pipelineHooks).isArray() ? o.pipelineHooks : [];

            //TODO:  add optimistic pipeline hook
            //TODO: add EventUpconverterPipelineHook

            var result = o.scheduleDispatchesFactory();

            if (result && result.done && result.fail) {
                result = createEventStore(result.promise, o.persistence, hooks);
                return result;
            }

            if (result && result.scheduleDispatch) {
                result = createEventStore(Q.resolve(result), o.persistence, hooks);
                return result;
            }

            throw new Error('scheduleDispatchesFactory must return either promise service or dispatch schedules');
        };

        function createEventStore (promiseScheduler, persistence, hooks) {
            var deferred = Q.defer();

            promiseScheduler.then(function (scheduler){
                var hook = new EventStore.DispatchSchedulerPipelineHook(scheduler);
                hooks.push(hook);

                persistence.initialize().
                    done(function(){
                        deferred.resolve(new EventStore.EventStore(persistence, hooks));
                    }).fail(function (e) {
                        deferred.reject(e);
                    });
            }).fail(function (e) {
                    deferred.reject(e);
                });

            return {
                done : function (store) {
                    var promise = deferred.promise.then(store);
                    return {
                        fail : function (e) {
                            promise.fail(e);
                        }
                    };
                },
                fail : function (e){
                    return deferred.promise.fail(e);
                }
            };
        }

        return {
            Init : function () {
                var config = {
                    persistence : new EventStore.Persistence.InMemoryPersistenceEngine()
                };
                return new Wireup(config);
            }
        };
    }());
});