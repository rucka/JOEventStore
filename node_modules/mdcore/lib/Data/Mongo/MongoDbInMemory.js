"use strict";
define(["underscore", "q", '../root'], function (_, Q, System) {
	System.namespace("System.Data.Mongo.MongoDbInMemory");

	var databases = {};
	var Db, Server, Collection, ObjectId;
    System.Data.Mongo.MongoDbInMemory.Db = Db = function (name, server, options) {
		var id = server + "/" + name, database = databases[id] || (databases[id] = db(id));
		for (var key in database) {this[key] = database[key];}
		
		return this;
	};
	
	function db(id) {
        var collections = {};
        var instance = {
        _state: 'disconnected',
        openCalled: false,
		open: function(callback) {
          this._state = 'connected';
          this.openCalled = true;
		callback(null);
		},
        close: function(forceClose, callback){
            if (_.isFunction(forceClose)){
                callback = forceClose;
                forceClose = true;
            }
            this._state = 'disconnected';
            this.openCalled = false;
            if (callback){
                callback(null);
            }
        },
		collection: function(name, options, callback) {
		    if (!callback) { callback = options; options = null; }
		    callback(null, collections[name] || (collections[name] = new System.Data.Mongo.MongoDbInMemory.Collection(db, id, name, options)));
		},
        dropCollection : function(collectionName, callback) {
            if (!collections[collectionName]){
                callback(new Error('collection not exists'));
            }
            collections[collectionName] = undefined;
            callback(null);
        },
		dropDatabase: function(){
			databases[id] = null;
		},
		toString: function() {
		  return id;
		},
		wrap : function(error) {
		  var msg = error.err || error.errmsg || error;
		  var e = new Error(msg);
		  e.name = 'MongoError';

		  // Get all object keys
		  var keys = Object.keys(error);
		  // Populate error object with properties
		  for(var i = 0; i < keys.length; i++) {
			e[keys[i]] = error[keys[i]];
		  }
		  
		  return e;
		}
	  };
        return instance;
	}
	
	System.Data.Mongo.MongoDbInMemory.Server = Server = function(host, port, options) {
	  var id = host + ":" + port;
	  this.toString = function() { return id; };
	  return this;
	}

    System.Data.Mongo.MongoDbInMemory.Collection = Collection = function(db, dbid, name, options) {
	  var collection = [];
      var id = dbid +'/' + name;
	  function find(query, fields, options, callback) {
  		if (arguments.length < 4) { callback = options; options = fields; } else {
              options = options || {};
              options.fields = fields;
        }
		if (typeof options === "function") { callback = options; options = null; }
		var objects = collection.filter(filter(query));
		if (options) {
		  if (options.sort) objects.sort(sorter(options.sort));
		  if (options.skip || ("limit" in options)) {
			var i = options.skip || 0;
			objects = objects.slice(i, i + (options.limit || Infinity));
		  }
		  if (options.fields && _(options.fields).isArray() && options.fields.length > 0) {
              objects = objects.map(mapper(options.fields));
          }
		}
		callback(null, cursor(objects));
	  }

      function findAndModify(query, sort, doc, options, callback) {
          var args = Array.prototype.slice.call(arguments, 1);
          callback = args.pop();
          sort = args.length ? args.shift() : [];
          doc = args.length ? args.shift() : null;
          options = args.length ? args.shift() : {};

          var fields = options.fields?options.fields:{};
          findOne(query, {}, {sort:sort}, function(err, olditem){

                if (err){
                    callback(err, null);
                    return;
                }
                var item = _({}).extend(olditem);
                item = _(item).extend(doc);
                update(olditem, item, {}, function(err){
                    if (err){
                        callback(err, null);
                        return;
                    }

                    findOne(query, {}, {sort:sort}, function(err, newitem){
                        if (err){
                            callback(err, null);
                            return;
                        }
                        if(options.remove){
                            remove(olditem, function(err){
                                if (err){
                                    callback(err, null);
                                    return;
                                }
                                if (options.new){
                                    callback(null, _.pick(newitem, fields));
                                }else{
                                    callback(null, _.pick(olditem, fields));
                                }
                            });
                        } else{
                            if (options.new){
                                var i = _(fields).isEmpty() ? newitem : _.pick(newitem, fields);
                                callback(null, i);
                            }else{
                                var i = _(fields).isEmpty() ? olditem : _.pick(olditem, fields);
                                callback(null, i);
                            }
                        }
                    });



                });
          });
      }

      function count(query, callback){
          if ('function' === typeof query) callback = query, query = {};
          find(query, function(e, c){
              if (e){
                callback(e, null);
                return;
              }
              c.toArray(function(ce, a){
                if (e){callback(ce,null);return;}
                callback(null, a.length);
              });
          });
      }

	  function findOne(query, fields, options, callback) {
		find(query, fields, options, function(err, cursor){
		cursor.toArray(function(err, items) {
			if(err != null) return callback(err instanceof Error ? err : db.wrap(new Error(err)), null);
			if(items.length >= 1) return callback(null, items[0]);
			callback(null, null);
		  });	
		});
	  }

	  // TODO detect duplicates
	  function insert(objects, options, callback) {
  		if (typeof options === "function") { callback = options; options = null; }
		if (isArray(objects)) {
		  var i = -1, n = objects.length, object;
		  while (++i < n) {
			object = objects[i];
			if (!("_id" in object)) object._id = new ObjectId();
			collection.push(object);
		  }
		} else {
		  if (!("_id" in objects)) objects._id = new ObjectId();
		  collection.push(objects);
		}
		if (callback) callback(null);
	  }
	  
	  function  isArray(obj) {
		return obj.constructor == Array;
		}

	  // TODO $ positional operator
	  function update(query, object, options, callback) {
		if (typeof options === "function") { callback = options; options = null; }
		var single = !(options && options.multi),
			found = false,
			f = filter(query),
			i = -1,
			n = collection.length,
			o;

		function u(o) {
		  var special = false,
			  operator;
		  for (var key in object) {
			if (key.charAt(0) === "$") {
			  special = true;
			  operator = update_operators[key];
			  if (operator) operator(o, object[key]);
			}
		  }
		  return special ? o : JSON.parse(JSON.stringify(object));
		}

		while (++i < n) {
		  if (f(o = collection[i])) {
			(collection[i] = u(o))._id = o._id;
			found = true;
			if (single) break;
		  }
		}

		if (!found && options && options.upsert) {
		  if (!("_id" in object) && !("_id" in query)){
              object._id = new ObjectId();
          }
          if ("_id" in query) {
              object._id = query._id;
          }
          u(object);
		  collection.push(object);
		}

		if (callback) callback(null);
	  }

	  function save(object, options, callback) {
		if ("_id" in object) {
		  if (options) options.upsert = true;
		  else options = {upsert: true};
		  update({_id: object._id}, object, options, callback);
		} else {
		  insert(object, options, callback);
		}
	  }

	  function remove(query, options, callback) {
		if (typeof options === "function") { callback = options; options = null; }
		var f = filter(query);
		collection = collection.filter(function(o) { return !f(o); });
		if (callback) callback(null);
	  }

        function drop(callback) {
            databases[dbid].dropCollection(name, callback);
        }

	  return {
        find: find,
        findOne: findOne,
        findAndModify: findAndModify,
        count: count,
        insert: insert,
		update: update,
		save: save,
		remove: remove,
        drop: drop,
		toString: function() { return id; }
	  };
	}

	// TODO search arrays (e.g., "comments.by": "joe" in comments: [{by: "joe"}])
	// TODO report errors when operator is unknown
	function filter(fields) {
	  var predicates = [],
		  key,
		  operator,
		  value,
		  special;

	  for (var field in fields) {
		value = fields[field];
		if (typeof value === "object") {
		  special = false;
		  for (key in value) {
			if (key.charAt(0) === "$") {
			  special = true;
			  operator = filter_operators[key];
			  if (key === "$regex") {
				key = new RegExp(value[key], value.$options || "");
			  } else if (!operator) {
				continue; // ignore
			  } else {
				key = value[key];
			  }
			  predicates.push(predicate(field, operator, key));
			}
		  }
		  if (special) continue;
		}
		predicates.push(predicate(field, equals, value));
	  }

	  function predicate(name, operator, value) {
		var names = name.split("."),
			n = names.length;
		return function(object) {
		  var i = -1, name;

		  while (++i < n) {
			if (!((name = names[i]) in object)) {
                if (isArray(object)) {
                    var k;
                    for (k in object) {
                        var o = object[k];
                        if (!((name = names[i]) in o)) {
                            return false;
                        }
                        o = o[name];
                        if (operator(o, value)) {
                            return true;
                        }
                    }
                }

                return false;
            }
			object = object[name];
		  }
		  return operator(object, value);
		};
	  }

	  return function(object) {
		var i = -1, n = predicates.length;
		while (++i < n) if (!predicates[i](object)) return false;
		return true;
	  };
	}

    function isArray(object)
    {
        if (object.constructor === Array) return true;
        else return false;
    }

	function sorter(sort) {

	  function value(o, k) {
		var keys = k.split("."), i = -1, n = keys.length;
		while (++i < n) {
		  if (!((k = keys[i]) in o)) return;
		  o = o[k];
		}
		return o;
	  }

	  return function(a, b) {
		for (var key in sort) {
		  var va = value(a, key),
			  vb = value(b, key),
			  vk = sort[key];
		  if (va < vb) return -vk;
		  if (va > vb) return vk;
		}
		return 0;
	  };
	}

	// TODO
	function mapper(fields) {
	  return function(object) {
		return _(object).pick(fields);
	  };
	}

	function equals(a, b) {
	  if (a === b) return true;
	  var ta = typeof a, tb = typeof b;
	  if (ta !== tb) return false;
	  if (a == b) return true;
	  if (ta !== "object") return false;
	  if (a instanceof Array) return b instanceof Array && equalsArray(a, b);
	  if (a instanceof Date) return b instanceof Date && !(a - b);
	  if (a instanceof ObjectId) return b instanceof ObjectId && ((a + "") === (b + ""));
	  return equalsObject(a, b);
	}

	function equalsArray(a, b) {
	  var i = -1, n = a.length;
	  if (n !== b.length) return false;
	  while (++i < n) if (!equals(a[i], b[i])) return false;
	  return true;
	}

	function equalsObject(a, b) {
	  var k;
	  for (k in a) {
		if (k in b) {
		  if (!equals(a[k], b[k])) return false;
		} else {
		  return false;
		}
	  }
	  for (k in b) {
		if (!(k in a)) {
		  return false;
		}
	  }
	  return true;
	}

	// TODO $all
	// TODO $exists
	// TODO $mod
	// TODO $in
	// TODO $nin
	// TODO $or
	// TODO $size
	// TODO $type
	// TODO $elemMatch
	// TODO $not
	// TODO $where
	var filter_operators = {
	  $gt: function(a, b) {
          if (a === null && b === null) {
              return false;
          }
          if (typeof a !== typeof b && a !== null && b !== null) {
              return false;
          }

          if (typeof a === 'object') {
              var gt = false;
              var k;
              for (var k in b) {
                  if (b[k] === undefined) {
                      return false;
                  }
                  if (filter_operators.$lt(a[k], b[k])) {
                      return false;
                  }
                  if (filter_operators.$gt(a[k], b[k])) {
                      gt = true;
                  }
              }
              return gt;
          }

          return a > b;
      },
	  $gte: function(a, b) {
          if (a === null && b === null) {
              return false;
          }
          if (typeof a !== typeof b && a !== null && b !== null) {
              return false;
          }

          if (typeof a === 'object') {
              var gt = false;
              var k;
              for (var k in b) {
                  if (b[k] === undefined) {
                      return false;
                  }
                  if (filter_operators.$lt(a[k], b[k])) {
                      return false;
                  }
              }
              return true;
          }
          return a >= b;
      },
	  $lt: function(a, b) {
          if (a === null && b === null) {
              return false;
          }
          if (typeof a !== typeof b && a !== null && b !== null) {
              return false;
          }

          if (typeof a === 'object') {
              var lt = false;
              var k;
              for (var k in b) {
                  if (b[k] === undefined) {
                      return false;
                  }
                  if (filter_operators.$lt(a[k], b[k])) {
                      lt = true;
                  }
                  if (filter_operators.$gt(a[k], b[k])) {
                      return false;
                  }
              }
              return lt;
          }
          return a < b;
      },
	  $lte: function(a, b) {
          if (a === null && b === null) {
              return false;
          }
          if (typeof a !== typeof b && a !== null && b !== null) {
              return false;
          }

          if (typeof a === 'object') {
              var k;
              for (var k in b) {
                  if (b[k] === undefined) {
                      return false;
                  }
                  if (filter_operators.$gt(a[k], b[k])) {
                      return false;
                  }
              }
              return true;
          }
          return a <= b;
      },
	  $ne: function(a, b) {
          return !equals(a, b);
      },
	  $regex: function(a, b) {
          return b.test(a);
      }
	};

	// TODO $push
	// TODO $pushAll
	// TODO $addToSet
	// TODO $pop
	// TODO $pull
	// TODO $pullAll
	// TODO $rename
	// TODO $bit
	var update_operators = {
      $inc: function (object, value) {
        for (var key in value) {
            object[key] = object[key] === undefined ? value[key] : object[key] + value[key];
        }
        delete object["$inc"];
      },
	  $set: function(object, value) {
		for (var key in value) {
		  var keys = key.split("."), i = -1, n = keys.length - 1, o = object;
		  while (++i < n) {
			if (!(keys[i] in o)) return;
			o = o[keys[i]];
		  }
		  o[keys[i]] = value[key];
		}
        delete object["$set"];
      },
	  $unset: function(object, value) {
		for (var key in value) {
		  var keys = key.split("."), i = -1, n = keys.length - 1, o = object;
		  while (++i < n) {
			if (!(keys[i] in o)) return;
			o = o[keys[i]];
		  }
		  delete o[keys[i]];
		}
        delete object["$unset"];
	  }
	};
	
	
	function cursor(objects) {
	  var i = -1;
	  return {
		each: function(callback) {
		  objects.forEach(function(object) { callback(null, object); });
		  callback(null, null);
		},
		toArray: function(callback) {
		  callback(null, objects);
		},
		nextObject: function(callback) {
		  callback(null, ++i < objects.length? objects[i] : null);
		}
	  };
	};
	
	var now = 0x4e21d7d4,
    machine_id = 0x0123ab,
    process_id = 0x0123,
    increment = 0;

    System.Data.Mongo.MongoDbInMemory.ObjectId = ObjectId = function(id) {
	  if (id == null) id = hex(++now, 8)
		  + hex(machine_id, 6)
		  + hex(process_id, 4)
		  + hex(++increment, 6);
	  this.toString = this.toJSON = function() { return id; };
	  return this;
	};

	function hex(n, width) {
	  var length = (n = n.toString(16)).length;
	  return length < width ? new Array(width - length + 1).join("0") + n : n;
	};  
});
