var EventStore = require('../main.js');
var System = require('mdcore');
var _ = require('underscore');
var Q = require('q');

var Db = require('mongodb').Db;
var Server = require('mongodb').Server;

this.EventStore = (function () {
    "use strict";
    System.ComponentModel.logger.filterComponents = ['EventStream', 'EventStore', 'MongoPersistenceEngine'];

    function createDbForMemory(name, server, newdb){
        var db = new System.Data.Mongo.MongoDbInMemory.Db(name, server);
        if (newdb){
            db.dropDatabase();
            return new System.Data.Mongo.MongoDbInMemory.Db(name, server);
        }
        return db;
    }

    function createDbForMongo(name, server, newdb){
        var db = new Db(name, server, {safe : true});

        return db;
    }

    function setupForMemory() {
        createDbForMemory('es-store-test', new System.Data.Mongo.MongoDbInMemory.Server('localhost', 27017, {}), true);

        EventStore.Persistence.MongoPersistenceEngine.createMongoDb = function (host, port, name) {
            return new System.Data.Mongo.MongoDbInMemory.Db(name, new System.Data.Mongo.MongoDbInMemory.Server(host, port, {}));
        };
    }

    function setupForMongo() {
        var server = new Server('127.0.0.1', 27017, {});
        createDbForMongo('es-store-test', server, true);

        EventStore.Persistence.MongoPersistenceEngine.createMongoDb = function (host, port, name) {
            return new Db(name, new Server(host, port, {}), {safe:true});
        };
    }

    return {
        setUp: function (callback) {

            setupForMemory();
            //setupForMongo();

            if (callback) {callback(); }
        },
        "EventStore required options": function (test) {
            test.expect(1);

            test.throws(function () {
                    var storeEvents = new EventStore.EventStore();
                },
                /persistence cannot be null/);
            test.done();
        },
        "EventStore required persistence": function (test) {
            test.expect(1);

            test.throws(function () {
                    var storeEvents = new EventStore.EventStore();
                },
                /persistence cannot be null/);
            test.done();
        },
        "create EventStore": function (test) {
            test.expect(1);

            var persistence = new EventStore.Persistence.InMemoryPersistenceEngine();
            var storeEvents = new EventStore.EventStore(persistence);
            test.ok(storeEvents);
            test.done();
        },
        "wireup store events, load from snapshot forward and append ": function (test) {
            test.expect(1);

            var commitCount = 0;
            var dispatchCommit = function (commit) {
                commitCount++;
                if (commitCount === 3){
                    test.ok(true);
                }
            };

            try {
                EventStore.
                    Wireup.
                    Init().
                    usingMongoPersistence('mongodb://localhost:27017/es-store-test').
                    usingAsynchronousDispatchScheduler().
                    dispatchTo(new EventStore.Dispatcher.DelegateMessageDispatcher(dispatchCommit)).
                    build().
                    done(run).
                    fail(function (e) {
                        test.fail(e.message);
                        test.done();
                    });
            } catch (e) {
                test.fail(e.message);
                test.done();
            }

            function run(store) {
                var streamId = System.ComponentModel.Guid.NewGuid().asString();
                var funcs = [purgeEventStore, openOrCreateStream, appendToStream, takeSnapshot, loadFromSnapshotForwardAndAppend];

                var result = Q.resolve({store: store, streamId: streamId});
                funcs.forEach(function (f) {
                    result = result.then(f);
                });

                result.
                    fail(function (error){
                        test.fail(error.message);
                    }).
                    fin(test.done);
            }

            function purgeEventStore(config) {
                var deferred = Q.defer();
                var promise = deferred.promise;

                try {
                    config.store.advanced().purge().
                        done(function () {deferred.resolve(config);}).
                        fail(function () {deferred.resolve(config);})
                    //fail(deferred.reject)
                    ;
                } catch (e) {
                    deferred.reject(e);
                }
                return promise;
            }

            function openOrCreateStream(config) {
                var deferred = Q.defer();
                var promise = deferred.promise;

                try {
                    config.store.openStream(config.streamId, 0, Number.MAX_VALUE).
                        done(function(stream) {
                            var event = {value : 'initial event.'};

                            var message = new EventStore.EventMessage({body : event});
                            var commitId = System.ComponentModel.Guid.NewGuid().asString();
                            stream.add(message);
                            stream.
                                commitChanges(commitId).
                                done(function () {
                                    deferred.resolve(config);
                                }).
                                fail(deferred.reject);
                        }).fail(deferred.reject);
                } catch (e) {
                    deferred.reject(e);
                }
                return promise;
            }

            function appendToStream(config) {
                var deferred = Q.defer();
                var promise = deferred.promise;

                try {
                    config.store.openStream(config.streamId, -Number.MAX_VALUE, Number.MAX_VALUE).
                        done(function (stream) {
                            var event = {value : 'second event.'};

                            var commitId = System.ComponentModel.Guid.NewGuid().asString();
                            stream.add(new EventStore.EventMessage({body : event}));
                            stream.
                                commitChanges(commitId).
                                done(function () {
                                    deferred.resolve(config);
                                }).
                                fail(deferred.reject);
                        }).fail(deferred.reject);
                } catch (e) {
                    deferred.reject(e);
                }

                return promise;
            }

            function takeSnapshot(config) {
                var deferred = Q.defer();
                var promise = deferred.promise;

                try {
                    var memento = {value : 'snapshot'};
                    config.store.advanced().addSnapshot(new EventStore.Snapshot(config.streamId, 2, memento)).
                        done(function () {deferred.resolve(config);}).
                        fail(deferred.reject)
                    ;
                } catch (e) {
                    deferred.reject(e);
                }

                return promise;
            }

            function loadFromSnapshotForwardAndAppend(config) {
                var deferred = Q.defer();
                var promise = deferred.promise;

                try {
                    config.store.advanced().
                        getSnapshot(config.streamId, Number.MAX_VALUE).
                        done(function (lastSnapshot){
                            config.store.openStream(lastSnapshot, Number.MAX_VALUE).
                                done(function(stream){
                                    var event = {value : 'Third event (first one after a snapshot).'};
                                    stream.add(new EventStore.EventMessage({body : event}));

                                    var commitId = System.ComponentModel.Guid.NewGuid().asString();
                                    stream.commitChanges(commitId).
                                        done(function () {deferred.resolve(config);}).
                                        fail(deferred.reject);
                                }).fail(deferred.reject);
                        }).fail(deferred.reject);
                } catch (e) {deferred.reject(e);}

                return promise;
            }
        },
        "at startup dispatch all commits not yet dispached" : function (test) {
            test.expect(1);

            var dispatchError = function (commit) {
                throw new Error('Commit id "' + commit.commitId + '" refused by dispatcher');
            };

            var dispatchOk = function () {
                test.ok(true);
            };

            try {
                EventStore.
                    Wireup.
                    Init().
                    usingMongoPersistence('mongodb://localhost:27017/es-store-test').
                    usingAsynchronousDispatchScheduler().
                    dispatchTo(new EventStore.Dispatcher.DelegateMessageDispatcher(dispatchError)).
                    build().
                    done(run).
                    fail(function (e) {
                        test.fail(e.message);
                        test.done();
                    });
            } catch (e) {
                test.fail(e.message);
                test.done();
            }

            function run(store) {
                var streamId = System.ComponentModel.Guid.NewGuid().asString();
                var commitId = System.ComponentModel.Guid.NewGuid().asString();

                var deferred = Q.defer();

                store.advanced().
                    purge().
                    done(function() {
                        store.openStream(streamId, 0, Number.MAX_VALUE).
                            done(function(stream) {
                                var event = {value : 'fake event'};

                                var message = new EventStore.EventMessage({body : event});
                                stream.add(message);
                                stream.
                                    commitChanges(commitId).
                                    done(deferred.resolve).
                                    fail(deferred.reject);
                            });
                    }).
                    fail(deferred.reject);

                deferred.promise.
                    fail(function (e) {
                        if (e.message === 'Commit id "' + commitId + '" refused by dispatcher') {
                            return;
                        }
                        throw e;
                    }).
                    then(function (){
                    EventStore.
                        Wireup.
                        Init().
                        usingMongoPersistence('mongodb://localhost:27017/es-store-test').
                        usingAsynchronousDispatchScheduler().
                            dispatchTo(new EventStore.Dispatcher.DelegateMessageDispatcher(dispatchOk)).
                        build().
                        done(function(){
                            test.done();
                        }).
                        fail(function (e) {
                            test.fail(e.message);
                            test.done();
                        });
                });

            }
        }
    };
}());