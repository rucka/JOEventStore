"use strict";
define(["underscore", "q", "mdcore", "../root"], function (_, Q, System, EventStore) {
    EventStore.namespace("EventStore");
    EventStore.DispatchSchedulerPipelineHook = (function () {
        var serviceName = 'DispatchSchedulerPipelineHook';
        var schedulerField = System.ComponentModel.PrivateName();

        function DispatchSchedulerPipelineHook(scheduler) {
            if (!scheduler) {
                scheduler = new EventStore.Dispatcher.NullDispatcher();
            }
            System.ComponentModel.Object.prototype.ensureHasMethods(scheduler, "scheduler", ['scheduleDispatch']);

            this[schedulerField] = scheduler;
        }

        DispatchSchedulerPipelineHook.prototype.getType = function() {return 'DispatchSchedulerPipelineHook';};
        DispatchSchedulerPipelineHook.prototype.select = function(committed) {return committed;};
        DispatchSchedulerPipelineHook.prototype.preCommit = function(committed) {return true;};
        DispatchSchedulerPipelineHook.prototype.postCommit = function(committed) {
            if (committed !== null) {
                var result = this[schedulerField].scheduleDispatch(committed);
                if (isPromiseService(result)) {
                    result = createPromiseService.call(this, result.promise);
                    return result;
                }
            }
        };

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
                    getType : function() {return DispatchSchedulerPipelineHook.prototype.getType.apply(that, arguments);},
                    select : function() {return DispatchSchedulerPipelineHook.prototype.select.apply(that, arguments);},
                    preCommit : function() {return DispatchSchedulerPipelineHook.prototype.preCommit.apply(that, arguments);},
                    postCommit : function() {return toPromise(DispatchSchedulerPipelineHook.prototype.postCommit.apply(that, arguments));}
                }
            });
            return builder.build().open();
        }

        function toPromise(promiseService) {
            var deferred = Q.defer();
            promiseService.done(deferred.resolve).fail(deferred.reject);
            return deferred.promise;
        }

        return DispatchSchedulerPipelineHook;
    }());
});