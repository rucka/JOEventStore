"use strict";
define(["underscore", "q", "mdcore", "../root"], function (_, Q, System, EventStore) {
    EventStore.namespace("EventStore.Dispatcher");
    EventStore.Dispatcher.DelegateMessageDispatcher = (function () {

        var serviceName = 'DelegateMessageDispatcher';
        var dispatchField = System.ComponentModel.PrivateName();

        function DelegateMessageDispatcher(action) {
            if (!action && !_(action).isFunction()) {
                throw new Error('Action must be a function');
            }
            this[dispatchField] = action;
        }

        DelegateMessageDispatcher.prototype.dispatch = function (commit) {
            var that = this;
            var result = dispatchPromise.call(this, commit);

            var builder = new System.ComponentModel.PromiseServiceBuilder({
                serviceName : serviceName,
                startupMethods : {
                    open : function () {
                        return result;
                    }
                },services : {
                    dispatch : function() {return dispatchPromise.apply(that, arguments);}
                }
            });
            return builder.build().open();
        };

        function dispatchPromise(commit) {
            var that = this;
            var deferred = Q.defer();

            try {
                var result = that[dispatchField](commit);

                if (result && result.done) {
                    result.done(deferred.resolve).
                        fail(deferred.reject);
                } else {
                    deferred.resolve();
                }
            } catch (e) {
                deferred.reject(e);
            }
            return deferred.promise;
        }

        return DelegateMessageDispatcher;
    }());
});