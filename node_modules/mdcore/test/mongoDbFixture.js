var System = require('../main');
var _ = require('underscore');
var Q = require('q');

this.MongoDbFixture = (function () {
    "use strict";
	return {
        setUp: function (callback) {
            createDb('test', new System.Data.Mongo.MongoDbInMemory.Server('localhost', 27017, {}), true);
            if (callback) {callback(); }
        },
        "can open db": function (test) {
            test.expect(1);

            System.Data.Mongo.MongoDbFactory.createDb = createDb;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                fail(function (error) {
                    test.fail(error.message);
                }).
                done(function () {
                    test.ok(true);
                }).
                close(function () {
                    test.done();
                });
        },
        "open db can not check done": function (test) {
            test.expect(0);

            System.Data.Mongo.MongoDbFactory.createDb = createDb;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                close(function () {
                    test.done();
                });
        },
        "fail called when open goes in error": function (test) {
            test.expect(1);

            System.Data.Mongo.MongoDbFactory.createDb = createOpenErrorMock;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                fail(function (e) {
                    test.strictEqual(e.message, 'Mock: open simulated error', 'Expected different error');
                }).
                close(function () {
                    test.done();
                });
        },
        "can open db and get collection": function (test) {
            test.expect(1);

            System.Data.Mongo.MongoDbFactory.createDb = createDb;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                fail(function (error) {
                    test.fail(error.message);
                }).
                done(function () {
                    test.ok(true);
                }).
                close(function () {
                    test.done();
                });
        },
        "open db and get collection can not check done": function (test) {
            test.expect(0);

            System.Data.Mongo.MongoDbFactory.createDb = createDb;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                close(function () {
                    test.done();
                });
        },
        "fail called when collection goes in error": function (test) {
            test.expect(1);

            System.Data.Mongo.MongoDbFactory.createDb = createCollectionErrorMock;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                fail(function (e) {
                    test.strictEqual(e.message, 'Mock: collection simulated error', 'Expected different error');
                }).
                close(function () {
                    test.done();
                });
        },
        "can open collection": function (test) {
            test.expect(1);

            System.Data.Mongo.MongoDbFactory.createDb = createDb;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                fail(function (error) {
                    test.fail(error.message);
                }).
                done(function () {
                    test.ok(true);
                }).
                close(function () {
                    test.done();
                });
        },
        "open collection can not check done": function(test) {
            test.expect(0);

            System.Data.Mongo.MongoDbFactory.createDb = createDb;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                close(function () {
                    test.done();
                });
        },
        "fail called when open collection goes in error": function(test) {
            test.expect(1);

            System.Data.Mongo.MongoDbFactory.createDb = createCollectionErrorMock;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                fail(function (error) {
                    test.strictEqual(error.message, 'Mock: collection simulated error', 'Expected different error');
                }).
                close(function () {
                    test.done();
                });
        },
        "can insert element": function(test) {
            test.expect(1);

            var docs = [{id: 1, name:'pippo'},{id: 2, name:'pluto'}];

            System.Data.Mongo.MongoDbFactory.createDb = createDb;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                insert(docs).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(items){
                    test.ok(true);
                }).
                close(function(){
                    test.done();
                });
        },
        "insert element error notify fail": function(test) {
            test.expect(1);

            var docs = [{id: 1, name:'pippo'},{id: 2, name:'pluto'}];

            System.Data.Mongo.MongoDbFactory.createDb = createActionsOperationErrorMock;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                insert(docs).
                fail(function(error){
                    test.strictEqual(error.message, 'Mock: insert simulated error', 'Expected different error');
                }).
                close(function(){
                    test.done();
                });
        },
        "can insert element and find": function(test) {
            test.expect(1);

            var docs = [{id: 1, name:'pippo'},{id: 2, name:'pluto'}];

            System.Data.Mongo.MongoDbFactory.createDb = createDb;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                insert(docs).
                done().
                find({}).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(items){
                    test.strictEqual(items.length, 2);
                }).
                close(function(){
                    test.done();
                });
        },
        "insert error is propagated to chain calls": function(test) {
            test.expect(1);

            var docs = [{id: 1, name:'pippo'},{id: 2, name:'pluto'}];

            System.Data.Mongo.MongoDbFactory.createDb = createActionsOperationErrorMock;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                insert(docs).
                done().
                find({}).
                fail(function(error){
                    test.strictEqual(error.message, 'Mock: insert simulated error', 'Expected different error');
                }).
                done().
                close(function(){
                    test.done();
                });
        },
        "can update element": function(test) {
            test.expect(1);

            var docs = [{id: 1, name:'pippo'},{id: 2, name:'pluto'}];

            System.Data.Mongo.MongoDbFactory.createDb = createDb;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                insert(docs).
                done().
                update({id:2},{name:'paperino'}).
                done().
                find({}).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(items){
                    test.strictEqual(items[1].name, 'paperino');
                }).
                close(function(){
                    test.done();
                });
        },
        "can count elements": function(test) {
            test.expect(1);

            var docs = [{id: 1, name:'pippo'},{id: 2, name:'pluto'}];

            System.Data.Mongo.MongoDbFactory.createDb = createDb;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                insert(docs).
                done().
                count({}).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(count){
                    test.strictEqual(count, 2);
                }).
                close(function(){
                    test.done();
                });
        },
        "can retrieve collection after find": function(test) {
            test.expect(1);

            var docs = [{id: 1, name:'pippo'},{id: 2, name:'pluto'}];

            System.Data.Mongo.MongoDbFactory.createDb = createDb;
            var db = new System.Data.Mongo.MongoDb('test', 'localhost', 27017);
            db.
                openCollection('fake').
                insert(docs).
                done().
                find({}).
                done().
                find({}).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(items){
                    test.strictEqual(items.length, 2);
                }).
                close(function(){
                    test.done();
                });
        },
        "can reuse same db after close": function(test) {
            var db = createDb('test', 'localhost', 27017);
            var docs = [{id: 1, name:'pippo'},{id: 2, name:'pluto'}];
            var closed = false;

            var mongoDb = new System.Data.Mongo.MongoDb(db);
            mongoDb.
                openCollection('fake').
                insert(docs).
                fail(function(error){
                    test.fail(error.message);
                }).
                done().
                close(function(){
                    closed = true;
                }).
                openCollection('fake').
                find({}).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(items){
                    test.ok(closed, 'expected closed');
                    test.strictEqual(items.length, 2);
                }).
                close(function(){
                    test.done();
                }).
                end();
        },
        "can mix db call in sequence": function(test) {
            var db = createDb('test', 'localhost', 27017);
            var docs = [{id: 1, name:'pippo'},{id: 2, name:'pluto'}];
            var closed = false;

            function insertPromise(){
                var def = Q.defer();

                var mongoDb = new System.Data.Mongo.MongoDb(db);
                mongoDb.
                    openCollection('fake').
                    insert(docs).
                    fail(def.reject).
                    done().
                    close(function(){
                        closed = true;
                        def.resolve();
                    }).
                    end();
                return def.promise;
            }

            function findPromise(){
                var def = Q.defer();

                var mongoDb = new System.Data.Mongo.MongoDb(db);
                mongoDb.openCollection('fake').
                    find({}).
                    fail(def.reject).
                    done(def.resolve).
                    close().
                    end();
                return def.promise;
            }

            insertPromise().
                then(function(){
                    test.ok(closed, 'Expected closed called');
                }).
                then(findPromise).fail(function(e){
                    test.fail('Expected no failure ' + e.message);
                }).
                then(function(){
                    test.done();
                });
        },
        "done could pass parameters to next call": function(test) {
            test.expect(2);

            var db = createDb('test', 'localhost', 27017);
            var docs = [{id: 1, name:'pippo'},{id: 2, name:'pluto'}];

            var mongoDb = new System.Data.Mongo.MongoDb(db);
            mongoDb.
                openCollection('fake').
                insert(docs).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(){
                    this.setNextCallParameters({id: 1});
                }).
                remove().
                done().
                find({}).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(items){
                    test.strictEqual(items.length, 1);
                    test.strictEqual(items[0].id, 2);
                }).
                close(function(){
                    test.done();
                }).
                end();
        },
        "fail could pass parameters to next call": function(test) {
            test.expect(2);

            var db = createDb('test', 'localhost', 27017);
            var docs = [{id: 1, name:'pippo'},{id: 2, name:'pluto'}];

            var mongoDb = new System.Data.Mongo.MongoDb(db);
            mongoDb.
                openCollection('fake').
                insert(docs).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(){
                    throw new Error('fake error');
                }).
                fail(function(){
                    this.setNextCallParameters({id: 1});
                }).
                remove().
                done().
                find({}).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(items){
                    test.strictEqual(items.length, 1);
                    test.strictEqual(items[0].id, 2);
                }).
                close(function(){
                    test.done();
                }).
                end();
        },
        "iftrue execute action if not true": function(test) {
            test.expect(3);

            var db = createDb('test', 'localhost', 27017);
            var docs = [{id: 1, name:'pippo'},{id: 2, name:'pluto'}];

            var mongoDb = new System.Data.Mongo.MongoDb(db);
            mongoDb.
                openCollection('fake').
                insert(docs).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(){
                    this.setNextCallParameters({id: 1});
                }).
                remove().
                done().
                find({}).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(items){
                    test.strictEqual(items.length, 1);
                    test.strictEqual(items[0].id, 2);
                }).
                iftrue(function(items){return items.length === 1;}).
                then(function(items){this.setNextCallParameters({id: items[0].id});}).
                remove().
                done().
                find({}).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(items){
                    test.strictEqual(items.length, 0);
                }).
                close(function(){
                    test.done();
                }).
                end();
        },
        "iftrue skip action if not true": function(test) {
            test.expect(3);

            var db = createDb('test', 'localhost', 27017);
            var docs = [{id: 1, name:'pippo'},{id: 2, name:'pluto'}];

            var mongoDb = new System.Data.Mongo.MongoDb(db);
            mongoDb.
                openCollection('fake').
                insert(docs).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(){
                    this.setNextCallParameters({id: 1});
                }).
                remove().
                done().
                find({}).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(items){
                    test.strictEqual(items.length, 1);
                    test.strictEqual(items[0].id, 2);
                }).
                iftrue(function(items){
                    return items.length === 2;
                }).
                then(function(){
                    test.fail('expected then not called');
                }).
                remove().
                done(function(){
                    test.fail('expected done not called');
                }).
                find({}).
                fail(function(error){
                    test.fail(error.message);
                }).
                done(function(items){
                    test.strictEqual(items.length, 1);
                }).
                close(function(){
                    test.done();
                }).
                end();
        }
    };

    function createDb(name,server, newdb){
        var db = new System.Data.Mongo.MongoDbInMemory.Db(name, server);
        if (newdb){
            db.dropDatabase();
            return new System.Data.Mongo.MongoDbInMemory.Db(name, server);
        }
        return db;
    }

    function createOpenErrorMock(name, server){
        return {
            open: function(cb){
                cb(new Error('Mock: open simulated error'));
            },
            close:function(forceClose, cb){
                cb(null);
            },
            collection:function(name, cb){
                cb(new Error('Mock: collection simulated error'));
            }
        };
    }

    function createCollectionErrorMock(name, server){
        return {
            open: function(cb){
                cb(null);
            },
            close:function(forceClose, cb){
                cb(null);
            },
            collection:function(name, cb){
                cb(new Error('Mock: collection simulated error'));
            }
        };
    }

    function createActionsOperationErrorMock(name, server){
        return {
            open:function(cb){
                cb(null);
            },
            close:function(forceClose, cb){
                cb(null);
            },
            collection:function(name, cb){
                cb(null, {
                    insert: function(objects, options, callback){
                        callback(new Error('Mock: insert simulated error'),null);
                    },
                    update: function(query, object, options, callback){
                        callback(new Error('Mock: update simulated error'),null);
                    },
                    save: function(object, options, callback){
                        callback(new Error('Mock: save simulated error'),null);
                    },
                    remove: function(query, options, callback){
                        callback(new Error('Mock: remove simulated error'),null);
                    },
                    find: function(query, fields, options, callback){
                        callback(new Error('Mock: find simulated error'),null);
                    },
                    findOne: function(query, fields, options, callback){
                        callback(new Error('Mock: findOne simulated error'),null);
                    },
                    count: function (query, callback){
                        callback(new Error('Mock: count simulated error'),null);
                    }
                });
            }
        };
    }
}());