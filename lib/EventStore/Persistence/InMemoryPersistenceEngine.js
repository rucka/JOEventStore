define(["underscore", "q", "mdcore", "../root"], function (_, Q, System, EventStore) {
    "use strict";
    EventStore.namespace("EventStore.Persistence");
    EventStore.Persistence.InMemoryPersistenceEngine = (function () {

        function InMemoryPersistenceEngine () {
            var dbname = new System.ComponentModel.Guid().asString();
            var db = function () {
                return new System.Data.Mongo.MongoDbInMemory.Db(dbname,new System.Data.Mongo.MongoDbInMemory.Server('localhost', 12345, {}));
            }
            var persistence = new EventStore.Persistence.MongoPersistenceEngine(db);
            persistence.isInMemory = true;
            return persistence;
        }

        return InMemoryPersistenceEngine;
    }());
});