"use strict";
define(["underscore", "q", "../root"], function (_, Q, System) {
	System.namespace("System.ComponentModel");

    var Context = (function (){
        var context = function() {
            var my = {
                bag : {},
                hasToSkipService : false
            };
            var that = this;

            that.isContext = function () {return true;};

            that.setReturnData = function (data) {
                my.returnData = data;
            };
            that.getReturnData = function () {return my.returnData;};

            that.setBagData = function (key, data) {
                my.bag[key] = data;
            };

            that.skipService = function () {
                my.hasToSkipService = true;
            };

            that.clearSkipService = function () {
                my.hasToSkipService = false;
            };

            that.hasToSkipService = function () {return my.hasToSkipService;};

            that.clearBagData = function (key) {
                my.bag[key] = undefined;
            };

            that.getBagData = function (key) {
                return my.bag[key];
            };
            that.setNextCallParameters = function (parameters) {
                my.nextCallParameters = parameters;
                my.hasNextCallParameters = true;
            };
            that.getNextCallParameters = function () {return my.nextCallParameters;};
            that.hasNextCallParameters = function () {return my.hasNextCallParameters;};
            that.clearNextCallParameters = function () {my.hasNextCallParameters = undefined; my.nextCallParameters = undefined;};

            return that;
        };
        return context;
    }());

    Context.next = function (context, returnData){
        context.setReturnData(returnData);
        context.clearNextCallParameters();

        return context;
    };

    System.ComponentModel.PromiseServiceBuilder = (function () {
        var PromiseServiceBuilder = function (options) {
            var that = this;

            if (!options.serviceName) {
                options.serviceName = 'PromiseService';
            }

            if (!options.startupMethods){
                options.startupMethods = {};
                //throw new Error('startupMethods is required in options');
            }

            if (!options.services){
                throw new Error('services is required in options');
            }

            if (!options.stopMethods){
                options.stopMethods = {};
            }

            if (!options.buildFunctionArguments) {
                options.buildFunctionArguments = function(serviceName, context, args){return args;};
            }

            function contextNextPromiseHandlerSuccess(context){
                return function() {
                    return Context.next(context, arguments);
                };
            }

            function contextNextPromiseHandlerFailure(context){
                return function(err) {
                    err.context = Context.next(context);
                    throw err;
                };
            }

            function removeContextFromPromise(promise)
            {
                return promise.then(function (arg){
                    if (arg.getReturnData){
                        var data = arg.getReturnData();
                        if (!_(data).isArguments()) {
                            return data;
                        }
                        if (data.length === 0) {
                            return;
                        }
                        if (data.length === 1) {
                            return _(data).first();
                        }
                        throw new Error('Promise cannot return more than one arguments');
                    }
                    return arg;
                });
            }

            function createDonePromiseFunction(promise, stepname) {
                return function (cb) {
                    var p = promise.then(function(context){
                        var args, dataResults, hasSetNextParameter = false, nextParameters, error;

                        if (!context.hasToSkipService() && cb) {
                            args = context ? context.getReturnData() : {};
                            var ref = {};
                            ref.setNextCallParameters = function() {nextParameters = arguments; hasSetNextParameter = true};
                            try{
                                dataResults = cb.apply(ref, args);
                            } catch (err) {
                                error = err;
                            }
                        }

                        if (context.hasToSkipService() && stepname !== 'then') {
                            context.clearSkipService();
                        }

                        context = Context.next(context, dataResults);
                        if (error) {
                            error.context = context;
                            throw error;
                        }
                        if (hasSetNextParameter){context.setNextCallParameters(nextParameters);}
                        if (isPromise(dataResults)){
                            return dataResults.then(function(item) {
                                var c = Context.next(context, item);
                                c.setReturnData(args);
                                return c;
                            });
                        } else {
                            context.setReturnData(args);
                        }
                        return context;
                    }, functionLogErrorOnFailPromise(stepname || 'done'));
                    var rp = {};
                    rp.promise = removeContextFromPromise(p);
                    rp.iftrue = createIfHappensPromiseFunction(p);
                    if (isInIf) {
                        rp.and = createDonePromiseFunction(p, 'and');
                    } else {
                        isInIf = false;
                    }
                    rp.fail = createFailPromiseFunction(p);

                    var serviceHandlers = createServiceHandlers(p);
                    _(serviceHandlers).each (function (v, k) {rp[k] = v;});

                    var stopHandlers = createStopHandlers(p);
                    _(stopHandlers).each (function (v, k) {rp[k] = v;});

                    return rp;
                };
            }

            function createFailPromiseFunction(promise) {
                return function (err) {
                    var p = promise.
                        fail(function (e) {
                            that.log('Error "' + e.message + '" has been catch', 'info');

                            var context = e.context;
                            e.context = undefined;
                            var hasSetNextParameter = false, nextParameters, error, dataResults;
                            if (err) {
                                var ref = {};
                                ref.setNextCallParameters = function() {nextParameters = arguments; hasSetNextParameter = true};
                                try{
                                    dataResults = err.apply(ref, [e]);
                                } catch (ex) {error = ex;}
                            }
                            if (context) {
                                context = Context.next(context, dataResults);
                            }
                            if (error) {
                                error.context = context;
                                throw error;
                            }
                            if (context && hasSetNextParameter){context.setNextCallParameters(nextParameters);}
                            if (isPromise(dataResults)){
                                return dataResults.then(function(item) {
                                    var c = Context.next(context, item);
                                    return c;
                                });
                            }
                            return context;
                        });
                    var rp = {};
                    rp.promise = removeContextFromPromise(p);
                    rp.iftrue = createIfHappensPromiseFunction(p);
                    if (isInIf) {
                        rp.and = createDonePromiseFunction(p, 'and');
                    } else {
                        isInIf = false;
                    }
                    rp.done = createDonePromiseFunction(p);

                    var serviceHandlers = createServiceHandlers(p);
                    _(serviceHandlers).each (function (v, k) {rp[k] = v;});

                    var stopHandlers = createStopHandlers(p);
                    _(stopHandlers).each (function (v, k) {rp[k] = v;});

                    return rp;
                };
            }

            var isInIf = false;
            function createIfHappensPromiseFunction(promise) {
                return function (cb) {
                    var p = promise.then(function(context){
                        var dataResults, error, args;

                        if (!cb) {
                            error = new Error('callback is required in order to perform if happens');
                        }

                        if (cb) {
                            args = context ? context.getReturnData() : {};
                            var ref = {};
                            try{
                                dataResults = cb.apply(ref, args);
                            } catch (err) {error = err;}
                        }
                        context = Context.next(context, isPromise(dataResults) ? dataResults : args);
                        if (!isPromise(dataResults) && dataResults !== true) {
                            context.skipService();
                        }
                        if (error) {
                            error.context = context;
                            throw error;
                        }
                        if (isPromise(dataResults)){
                            return dataResults.then(function(item) {
                                var c = Context.next(context, args);
                                if (item !== true) {
                                    context.skipService();
                                }
                                return c;
                            });
                        }
                        return context;
                    }, functionLogErrorOnFailPromise('iftrue'));
                    var rp = {};
                    rp.then = createDonePromiseFunction(p, 'then');
                    isInIf = true;
                    return rp;
                };
            }

            function isPromise(item) {
                return item && item.promiseSend !== undefined;
            }

            function createEndPromiseFunction(promise) {
                return function () {
                    promise.fail(functionLogErrorOnFailPromise('end'))/*.end()*/;
                };
            }

            function functionLogErrorOnFailPromise(section) {
                return function (e) {
                    that.log('Fail during promise ' + section + ' execution: ' + e.message + '. Block will be skipped until either fail or end block.', 'warn');
                    throw e;
                };
            }

            that.build = function (promise) {
                promise = promise || createEmptyPromise();
                var rp = createStartupHandlers(promise);
                return rp;
            };

            function createStartupHandlers (promise) {
                var item = {};

                if (options.startupMethods.length === 0) {
                    return createServiceHandlers(promise);
                }

                var k;
                for (k in options.startupMethods){
                    item[k] = createStartupHandler(promise, k);
                }

                return item;
            }

            function createStartupHandler(promise, key) {
                var f = function () {
                    var args = arguments;
                    var context = new Context();
                    var service = options.startupMethods[key];

                    var p = promise.then(function () {
                        return service.apply(context, args);
                    });
                    p = p.then(function(data) {
                            if (data){
                                context.setReturnData(arguments);
                            }
                            return context;
                        }, functionLogErrorOnFailPromise(key));
                    var rp = createServiceHandlers(p);
                    rp.promise = removeContextFromPromise(p);
                    rp.fail = createFailPromiseFunction(p);
                    rp.done = createDonePromiseFunction(p);

                    var stopHandlers = createStopHandlers(p);
                    _(stopHandlers).each (function (v, k) {rp[k] = v;});

                    return rp;
                };
                return f;
            }

            function createServiceHandlers(promise) {
                var rp = {};
                var k;
                for (k in options.services) {
                    rp[k] = createServiceHandler(promise, k);
                }
                return rp;
            }
            
            function createServiceHandler(promise, key) {
                var service = options.services[key];
                return function () {
                    var args = arguments;
                    var p = promise.then(function (context) {
                        if (context.hasToSkipService()){
                            //context.clearSkipService();
                            return context;
                        }

                        context.setReturnData(undefined);
                        if (context.hasNextCallParameters()) {
                            var params = context.getNextCallParameters();
                            args = options.buildFunctionArguments(key, context, params);
                        } else {
                            args = options.buildFunctionArguments(key, context, args);
                        }
                        var result = service.apply(context, args);
                        return result.then(contextNextPromiseHandlerSuccess(context), contextNextPromiseHandlerFailure(context));
                    }, functionLogErrorOnFailPromise(key));
                    var rp = {};
                    rp.promise = removeContextFromPromise(p);
                    var doneKey = 'done';

                    rp[doneKey] = createDonePromiseFunction(p);
                    rp.fail = createFailPromiseFunction(p);

                    var stopHandlers = createStopHandlers(p);
                    _(stopHandlers).each (function (v, k) {rp[k] = v;});

                    return rp;
                };
            }

            function createStopHandlers (promise) {
                var rp = {};
                var k;
                for (k in options.stopMethods) {
                    rp[k] = createStopHandler(promise, k);
                }
                return rp;
            }

            function createStopHandler(promise, key) {
                var service = options.stopMethods[key];

                return function (cb) {
                    var p = promise.then(function(context) {
                        var args = options.buildFunctionArguments(key, context, []);
                        return service.apply({}, args);
                    }).then(cb, cb);
                    var rp = {};
                    rp.promise = removeContextFromPromise(p);

                    var startHandlers = createStartupHandlers(p);
                    _(startHandlers).each (function (v, k) {rp[k] = v;});

                    rp.end = createEndPromiseFunction(p);
                    return rp;
                };
            }

            function createEmptyPromise() {
                return Q.fcall(function () {return {}; });
            }

            that.log = function (message, level, category, metadata) {
                System.ComponentModel.logger.log(message, level, options.serviceName, category, metadata);
            };

            that.logverbose = function (message, category, metadata) {
                System.ComponentModel.logger.log(message, 'verbose', options.serviceName, category, metadata);
            };

            that.logerror = function (message, category, metadata) {
                System.ComponentModel.logger.log(message, 'err', options.serviceName, category, metadata);
            };
        };

        PromiseServiceBuilder.prototype.helper = {
            createEmptyPromise : function () {
                return Q.fcall(function () {return {}; });
            }
        };

        return PromiseServiceBuilder;
    }());
});