define(["underscore", "q", "mdcore", "../root"], function (_, Q, System, EventStore) {
    "use strict";
    EventStore.namespace("EventStore.Persistence");
    EventStore.Persistence.MongoPersistenceEngine = (function () {
        var serviceName = 'MongoPersistenceEngine';

        var initializedField = System.ComponentModel.PrivateName();

        var dbField = System.ComponentModel.PrivateName();
        var connectionStringField = System.ComponentModel.PrivateName();
        var commitsCollectionNameField = System.ComponentModel.PrivateName();
        var streamCollectionNameField = System.ComponentModel.PrivateName();
        var snapshotCollectionNameField = System.ComponentModel.PrivateName();

        function MongoPersistenceEngine () {
            if (arguments.length !== 1) {
                throw new Error('Expected one parameter');
            }

            if (_(arguments[0]).isString()){
                var connectionString = arguments[0];
                var re = /mongodb:\/\/([^:]*):?(\d+)?\/(.+)/i;
                var match = connectionString.match(re);
                if (match.length !== 4) {
                    throw new Error('Connection String "' + connectionString + '" not in valid format');
                }
                var host = match[1];
                var port = match[2] && match[2] !== '' ? parseInt(match[2]) : 27017;
                var dbname = match[3];
                this[dbField] = function () {
                    return MongoPersistenceEngine.createMongoDb(host, port, dbname);
                };
                this[connectionStringField] = connectionString;
            } else {
                if (!_(arguments[0]).isFunction()) {
                    throw new Error('Expected either connection string or db factory as parameter');
                }
                this[dbField] = arguments[0];
                this[connectionStringField] = false;
            }

            this[commitsCollectionNameField] = 'Commits';
            this[streamCollectionNameField] = 'Streams';
            this[snapshotCollectionNameField] = 'Snapshots';
            this[initializedField] = false;
        }

        function getDb() {
            return this[dbField]();
        }

        function persistedCommits(){
            var mongo = new System.Data.Mongo.MongoDb(getDb.call(this));
            return mongo.openCollection(this[commitsCollectionNameField]).done();
        }

        function persistedStreamHeads(){
            var mongo = new System.Data.Mongo.MongoDb(getDb.call(this));
            return mongo.openCollection(this[streamCollectionNameField]).done();
        }

        function persistedSnapshots(){
            var mongo = new System.Data.Mongo.MongoDb(getDb.call(this));
            return mongo.openCollection(this[snapshotCollectionNameField]).done();
        }


        MongoPersistenceEngine.prototype.initialize = function () {
            var deferred = Q.defer();
            if (this[initializedField]) {
                deferred.resolve();
                return wrapPromiseToService.call(this, deferred.promise);
            }
            try {
                //create collections and indicies

                this[initializedField] = true;
                deferred.resolve();
            } catch (e) {
                deferred.reject(e);
            }
            return wrapPromiseToService.call(this, deferred.promise);
        };

        MongoPersistenceEngine.prototype.getFrom = function () {
            var promise;
            if (arguments.length === 1 && !_(arguments[0]).isDate())
            {
                throw new Error('getFrom require a start parameter as unique argument');
            }

            if (arguments.length === 1 && _(arguments[0]).isDate())
            {
                promise = getFromStart.call(this, arguments[0]);
                return wrapPromiseToService.call(this, promise);
            }

            if (arguments.length !== 3) {
                throw new Error('getFrom required streamId, minRevision and maxRevision');
            }

            if (!_(arguments[1]).isNumber() || !_(arguments[2]).isNumber()) {
                throw new Error('minRevision and maxRevision must be a number');
            }
            promise = getAllCommitsFrom.call(this, arguments[0], arguments[1], arguments[2]);
            return wrapPromiseToService.call(this, promise);
        };

        function getAllCommitsFrom(streamId, minRevision, maxRevision) {
            validateStreamId(streamId);

            logdebug("Getting all commits for stream '{0}' between revisions '{1}' and '{2}'.".
                replace('{0}', streamId).
                replace('{1}', minRevision).
                replace('{2}', maxRevision));

            var query = {
                '_id.StreamId' : toUUID(streamId),
                'Events.StreamRevision' : {'$gte': minRevision, '$lte':maxRevision}
            };

            var error, result;

            var deferred = Q.defer();
            persistedCommits.call(this).
                find(query, {}, {'sort': 'Events.StreamRevision'}).
                done(function (docs){
                    result = toCommits(docs);
                }).
                fail(function (e) {
                    error = e;
                }).
                close(function () {
                    if (error) {
                        deferred.reject(error);
                    } else {
                        deferred.resolve(result);
                    }
                });
            return deferred.promise;
        }

        function getFromStart(start){
            logdebug("Getting all commits from '{0}' forward.".replace('{0}', start));

            var query = {
                'CommitStamp' : {'$gt': start}
            };

            var error, result;
            var deferred = Q.defer();
            persistedCommits.call(this).
                find(query, {}, {'sort': 'CommitStamp'}).
                done(function (docs){result = toCommits(docs);}).
                fail(function (e) {
                    error = e;
                }).
                close(function () {
                    if (error) {
                        deferred.reject(error);
                    } else {
                        deferred.resolve(result);
                    }
                });
            return deferred.promise;
        }

        function toCommits(docs) {
            var commits = _(docs).map(function (doc){
              return toCommit(doc);
            });
            return commits;
        }

        MongoPersistenceEngine.prototype.commit = function (attempt) {
            var that = this;
            validateStreamId(attempt.streamId);
            logdebug("Attempting to commit {0} events on stream '{1}' at sequence {2}.".
                replace('{0}', attempt.events.length).
                replace('{1}', attempt.streamId).
                replace('{2}', attempt.commitSequence));

            var commit = toMongoCommit(attempt);

            var streamId = attempt.streamId;
            var streamRevision = attempt.streamRevision;
            var eventsCount = attempt.events.length;

            var concurrencyExceptionValue = "E1100";

            var deferred = Q.defer();

            var error;

            persistedCommits.call(this).
                insert(commit, {safe:true}).
                done().
                close(false).
                openCollection(that[streamCollectionNameField]).
                update({_id : toUUID(streamId)}, {$set : {HeadRevision: streamRevision}, $inc : {SnapshotRevision : 0, Unsnapshotted : eventsCount}}, {upsert : true}).
                done(function () {
                    logdebug("Commit '{0}' persisted.".replace('{0}', attempt.commitId));
                }).
                fail(function (e) {
                    return manageCommitErrorPromise.call(that, e, streamId, commit, attempt).
                        then().fail(function(e) {
                            error = e;
                        });
                }).
                close(function () {
                    if (error) {
                        deferred.reject(error);
                    } else {
                        deferred.resolve();
                    }
                });


            return wrapPromiseToService.call(this, deferred.promise);
        };

        function manageCommitErrorPromise(err, streamId, commit, attempt) { //TODO: test me!!
            var deferred = Q.defer();
            if (err.message.indexOf('concurrencyExceptionValue') !== -1) {
                deferred.reject(err);
                return deferred.promise;
            }

            var error = err;

            persistedCommits.call(this).
                findOne({'_id.StreamId' : toUUID(streamId), '_id.CommitSequence': commit.commitSequence}).
                done(function(doc){
                    if (!doc) {
                        error = err;
                        return;
                    }
                    var savedCommit = toCommit(doc);
                    var ex;
                    if (savedCommit.commitId === attempt.commitId) {
                        ex = new Error('Duplicated commit');
                        ex.getType = function () {return 'DuplicateCommitError';};
                        error = ex;
                        return;
                    }
                    logdebug('Concurrent write detected.');
                    ex = new Error('Concurrent write detected.');
                    ex.getType = function () {return 'ConcurrencyError';};
                    error = ex;
                }).
                fail(function (e) {
                    error = e;
                }).
                close(function () {
                    if (error) {
                        deferred.reject(error);
                    } else {
                        deferred.resolve();
                    }
                });

            return deferred.promise;
        }

        MongoPersistenceEngine.prototype.getUndispatchedCommits = function () {
            logdebug("Getting the list of all undispatched commits.");
            var deferred = Q.defer();

            var error;
            var result;
            var collection = persistedCommits.call(this);
            collection.
                find({Dispatched: false}, {}, {sort : {CommitStamp : 1}}).
                done(function (docs) {
                    var commits = toCommits(docs);
                    result = commits;
                }).
                fail(function (e) {
                    error = e;
                }).
                close(function () {
                    if (error) {deferred.reject(error);} else {deferred.resolve(result);}
                });

            return wrapPromiseToService.call(this, deferred.promise);
        };

        MongoPersistenceEngine.prototype.markCommitAsDispatched = function (commit) {
            logdebug("Marking commit '{0}' as dispatched.".replace("{0}", commit.commitId));
            var deferred = Q.defer();

            var query = {
                _id : {
                    StreamId : toGuidString(commit.streamId),
                    CommitSequence : commit.commitSequence
                }
            };

            var error;

            persistedCommits.call(this).
                update(query, {'$set' : {Dispatched : true}}, {}).
                done().
                fail(function (e) {
                    error = e;
                }).
                close(function () {
                    if (error) {deferred.reject(error);} else {deferred.resolve();}
                });

            return wrapPromiseToService.call(this, deferred.promise);
        };

        MongoPersistenceEngine.prototype.purge = function () {
            logwarn("Purging all stored data.");
            var deferred = Q.defer();
            var that = this;
            var db = that[dbField];

            [purgeCollectionPromiseFunction(that, that[commitsCollectionNameField]),
                purgeCollectionPromiseFunction(that, that[snapshotCollectionNameField]),
                purgeCollectionPromiseFunction(that, that[streamCollectionNameField])].
                reduce(function (soFar, f) {
                    return soFar.then(f);
                }, Q.resolve()).then(deferred.resolve).fail(deferred.reject);

            return wrapPromiseToService.call(this, deferred.promise);
        };

        MongoPersistenceEngine.prototype.getSnapshot = function (streamId, maxRevision) {
            logdebug("Getting snapshot for stream '{0}' on or before revision {1}.".replace("{0}", streamId)
                .replace("{1}", maxRevision));

            var deferred = Q.defer();
            var error, result;

            persistedSnapshots.call(this).
                find(toSnapshotQuery(streamId, maxRevision), {}, {sort : {_id : -1}, limit : 1}).
                done(function (items) {
                    if (items.length === 0){
                        return;
                    }
                    result = _.chain(items).map(function(i){return toSnapshot(i);}).first()._wrapped;
                }).
                fail(function (e) {
                    error = e;
                }).
                close(function () {
                    if (error) {deferred.reject(error);} else {deferred.resolve(result);}
                });

            return wrapPromiseToService.call(this, deferred.promise);
        };

        MongoPersistenceEngine.prototype.addSnapshot = function (snapshot) {
            var deferred = Q.defer();
            if (!snapshot) {
                deferred.resolve(false);
                return wrapPromiseToService.call(this, deferred.promise);
            }
            logdebug("Adding snapshot to stream '{0}' at position {1}.".
                replace('{0}', snapshot.streamId).
                replace('{1}', snapshot.streamRevision)
            );
            var error, result;

            var mongoSnapshot = toMongoSnapshot(snapshot);
            var id = mongoSnapshot._id;
            persistedSnapshots.call(this).
                update({_id : id}, {Payload: mongoSnapshot["Payload"], _id : id}, {upsert:true}).
                done().
                close().
                openCollection(this[streamCollectionNameField]).
                findOne({_id:toUUID(snapshot.streamId)}).
                done(function(streamHeadDoc) {
                    var streamHead = toStreamHead(streamHeadDoc);
                    var unsnapshotted = streamHead.headRevision - snapshot.streamRevision;
                    this.setNextCallParameters({_id: toUUID(snapshot.streamId)}, {$set : {SnapshotRevision: snapshot.streamRevision, Unsnapshotted: unsnapshotted}});
                }).
                update().
                done(function(){
                    result = true;
                }).
                fail(function(e) {
                    result = false;
                }).
                close(function () {
                    if (error) {deferred.reject(error);} else {deferred.resolve(result);}
                });
            return wrapPromiseToService.call(this, deferred.promise);
        };

        MongoPersistenceEngine.prototype.getStreamsToSnapshot = function (maxThreshold) {
            var deferred = Q.defer();

            logdebug('Getting a list of streams to snapshot.');
            var result, error;

            persistedStreamHeads.call(this).
                find({$gte : {'Unsnapshotted' : maxThreshold}}, {}, {sort : {'Unsnapshotted' : -1}}).
                done(function (docs){
                    result = _(docs).map(function (d){
                        return toStreamHead(d);
                    });
                }).
                fail(function (e) {error = e;}).
                close(function () {
                    if (error) {deferred.reject(error);} else {deferred.resolve(result);}
                });
            return wrapPromiseToService.call(this, deferred.promise);
        };

        MongoPersistenceEngine.createMongoDb = function (host, port, name) {
            throw new Error('createMongoDb must be override');
        };

        function toSnapshotQuery(streamId, maxRevision) {
            return {
                "_id" : {
                    "$gt" : {
                        "StreamId" : toUUID(streamId), "StreamRevision" : null
                    },
                    "$lte" : {
                        "StreamId" : toUUID(streamId), "StreamRevision" : maxRevision
                    }
                }
            };
        }

        function toSnapshot(doc) {
            if (doc === null)
            {
                return null;
            }
            var id = doc._id;
            var streamId = toGuidString(id.StreamId);
            var streamRevision = id.StreamRevision;
            var payload = _(doc.Payload).omit("_t");
            var type = doc.Payload._t;
            return new EventStore.Snapshot(streamId, streamRevision, payload, type);
        }

        function purgeCollectionPromiseFunction(that, collectionName) {
            return function() {
                var db = that[dbField];
                var mongo = new System.Data.Mongo.MongoDb(getDb.call(that));

                var deferred = Q.defer();
                var error;
                mongo.
                    openCollection(collectionName).
                    done().
                    drop().
                    fail(function(e){
                        if (e.message !== 'MongoError: ns not found') {
                            throw e;
                        }
                    }).
                    done().
                    fail(function (e) {
                        error = e;
                    }).
                    close(function () {
                        if (error) {
                            deferred.reject(error);
                        } else {
                            deferred.resolve();
                        }
                    })
                ;
                return deferred.promise;
            };
        }

        function toMongoCommit(attempt) {
            var streamRevision = attempt.streamRevision - (attempt.events.length - 1);
            var events = _(attempt.events).map(function (e){
                var eventBody = e.body;
                eventBody._t = e.getType ? e.getType() : 'object';
                return {
                    "StreamRevision" : streamRevision++,
                    "Payload" : {
                        Headers : e.headers,
                        Body :e.body
                    }
                };
            });

            var streamId = toUUID(attempt.streamId);
            var commitId = toUUID(attempt.commitId);

            var json = {
                _id : {
                    StreamId : streamId,
                    CommitSequence : attempt.commitSequence
                },
                CommitId : commitId,
                CommitStamp : attempt.commitStamp,
                Headers : _(attempt.headers).clone(),
                Events : events,
                Dispatched : false
            };
            return json;
        }

        function toCommit(doc) {
            var id = doc._id;
            var streamId = toGuidString(id.StreamId);
            var commitSequence = id.CommitSequence;
            var events = _(doc.Events).map(function(e){
                var payload = e.Payload;
                return new EventStore.EventMessage({
                    headers : payload.Headers,
                    body : _(payload.Body).omit('_t')
                });
            });

            var streamRevision = _(doc.Events).last().StreamRevision;
            var commit = new EventStore.Commit(
                streamId,
                streamRevision,
                toGuidString(doc.CommitId),
                commitSequence,
                doc.CommitStamp,
                doc.Headers,
                events);

            return commit;
        }

        function toMongoSnapshot(snapshot) {
            var json = {
                _id : {
                    StreamId : toUUID(snapshot.streamId),
                    StreamRevision: snapshot.streamRevision
                },
                Payload : snapshot.payload
            };

            json.Payload['_t'] = (snapshot.getType ? snapshot.getType() : 'Memento');
            return json;
        }

        function toStreamHead (doc) {
            return new EventStore.StreamHead(
                toGuidString(doc._id),
                doc.HeadRevision,
                doc.SnapshotRevision);
        }

        function toGuidString(uuid) {
            return uuid;
            //return uuid.$uuid;
        }

        function toUUID(guidAsString) {
            return guidAsString;
            //return {"$uuid": guidAsString};
        }

        function wrapPromiseToService(promise) {
            var that = this;

            var builder = new System.ComponentModel.PromiseServiceBuilder({
                serviceName : serviceName,
                startupMethods : {
                    open : function () {
                        return promise;
                    }
                },
                stopMethods : {},
                services :
                {
                    getFrom : function() { return toPromise(MongoPersistenceEngine.prototype.getFrom.apply(that, arguments));},
                    commit : function() { return toPromise(MongoPersistenceEngine.prototype.commit.apply(that, arguments));},
                    getUndispatchedCommits : function() { return toPromise(MongoPersistenceEngine.prototype.getUndispatchedCommits.apply(that, arguments));},
                    markCommitAsDispatched : function() { return toPromise(MongoPersistenceEngine.prototype.markCommitAsDispatched.apply(that, arguments));},
                    purge : function() { return toPromise(MongoPersistenceEngine.prototype.purge.apply(that, arguments));},
                    getSnapshot : function() { return toPromise(MongoPersistenceEngine.prototype.getSnapshot.apply(that, arguments));},
                    addSnapshot : function() { return toPromise(MongoPersistenceEngine.prototype.addSnapshot.apply(that, arguments));},
                    getStreamsToSnapshot : function() { return toPromise(MongoPersistenceEngine.prototype.getStreamsToSnapshot.apply(that, arguments));}
                }
            });
            return builder.build().open(function (data){
                return data;
            });
        }

        function toPromise(promiseService) {
            var deferred = Q.defer();
            promiseService.done(deferred.resolve).fail(deferred.reject);
            return deferred.promise;
        }

        function validateStreamId(streamId) {
            var pattern1 = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
            var pattern2 = /^\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}‌​\}?$/;

            if (pattern1.test(streamId) || pattern2.test(streamId)) {
                return;
            }
            throw new Error("Invalid stream id " + streamId + " : it must be a guid");
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

        return MongoPersistenceEngine;
    }());
});