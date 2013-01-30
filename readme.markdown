joliver EventStore node.js porting
======================================================================
## Disclaimer 
This readme is modified from https://github.com/joliver/EventStore/blob/master/readme.markdown, in order to leave
the essence of joliver EventStore and their goal.
Let's go!

## Overview
The EventStore is a persistence library used to abstract different storage implementations
when using event sourcing as storage mechanism.  Event sourcing is most closely associated
with a concept known as [CQRS](http://cqrsinfo.com).

### Need Help? Have a Question?
Ask your question on [Stack Overflow](http://stackoverflow.com/search?q=[cqrs]+eventstore) and tag your question with
the CQRS tag and the word "EventStore" in the title.

### Purpose and Theory
The purpose of the EventStore is to represent a series of events as a stream.  Furthermore,
it provides hooks whereby any events committed to the stream can be dispatched to interested
parties.

Guided by a number strategic design decisions based upon the needs of applications using event sourcing,
the EventStore is able to liberate applications from the stringent requirements often imposed by
infrastructure components.  Specifically, most CQRS-style applications read from a message queue
and perform some processing.  When processing is complete, the application then commits the work
to storage and publishes the completed work.

The EventStore liberates application developers from this level of infrastructure awareness and
concern by committing all work within a separate isolated atomic unit--all without using transactions.
Furthermore, it does this outside of any ambient transaction from a message queue or other
persistence mechanisms.  In other words, application developers are free to use virtually any
messaging queuing infrastructure, message bus (if at all), and storage engine. Each will perform
its own specific task in an isolated manner with full transactional integrity all without
enlisting any resources (other than a message queue) in some form of transaction.

Interestingly enough, even without the presence of distributed transactions across the various resources
involved, such as a message queue and persistent storage, the EventStore is able to ensure a fully
transactional experience.  This is achieved by breaking apart a distributed transaction into smaller
pieces and performing each one individually.  This is one of the primary goals and motivations in the
underlying model found in the EventStore.  Thus each message delivered by the queuing infrastructure is
made to be idempotent, even though the message may be delivered multiple times, as per message queue
"at-least-once" guarantees.  Following this, the EventStore is able to ensure that all events committed
are always dispatched to any messaging infrastructure.

## Supported Storage Engines

### Relational Databases
[Planned] MySQL 5.0 (or later)  

### Cloud-based Databases (relational or otherwise)
[Planned] Microsoft SQL Azure  
[Planned] Amazon RDS (MySQL)  
[Planned] Amazon RDS (Oracle)  
[Planned] Azure Tables/Blobs  
[Planned] Amazon SimpleDB/S3  

### Document Databases
[Planned] RavenDB r322 (or later)  
[Complete] MongoDB 1.6 (or later)  
[Complete] In Memory (only for test purpose)  

### File System
[Planned] node.js API  
 

## Project Goals
* Node js support  
* Cloud platform support  
* Support more storage engines than any other event storage implementation  
* Easily support virtually any storage engine (NoSQL, etc.)  
* Avoid dependence upon Transactions while maintaining full data integrity  
* Full test coverage of storage implementations  
* Easily hook into any bus implementation (NServiceBus, MassTransit, etc.)  
* Synchronous and asynchronous dispatching of events  
* Support storage instance created by C# joliver EventStore 
* Multi-thread safe  
* Fluent builder
* Support CommonJs module management
* Take advantage of promise pattern (based on Q library)

## Dependencies
* nodeunit
* mongodb
* q
* requirejs
* underscore
* underscore.string 
* wrench

## Running
Simply run npm install joeventstore from node console then require('joeventstore') from your node.js file.

## Using the EventStore
		var EventStore = require('joeventstore');

                EventStore.
                    Wireup.
                    Init().
                    usingMongoPersistence('ConnectionString of mongo db').
                    usingAsynchronousDispatchScheduler().
                    dispatchTo(new EventStore.Dispatcher.DelegateMessageDispatcher(my_NServiceBus_Or_MassTransit_OrEven_WCF_Adapter_Code)).
                    build().
                    done(run).
                    fail(function (e) {
			//Manage error
                    });

/* NOTE: This following is merely *example* code. */
			
		function run (store) {
			// some business code here
			
			store.
			createStream(myMessage.customerId).
                        done(function(stream) {
                            stream.add(new EventStore.EventMessage({body : myMessage}));
                            return stream.
                                commitChanges(myMessage.messageId).
                                done();
                        }).
			openStream(myMessage.customerId, 0, Number.MAX_VALUE)).
			done(function (stream) {
				var event;
				for (event n stream.committedEvents) {
					// business processing...			
				}
			}).
			fail(function (e) {
				//Manage error...
			});
		}

		

	/* NOTE: This following is merely *example* code. */

	using (store)
	{
		// some business code here
		using (var stream = store.CreateStream(myMessage.CustomerId))
		{
			stream.Add(new EventMessage { Body = myMessage });
			stream.CommitChanges(myMessage.MessageId);
		}
		
		using (var stream = store.OpenStream(myMessage.CustomerId, 0, int.MaxValue))
		{
			foreach (var @event in stream.CommittedEvents)
			{
				// business processing...
			}
		}
	}

For a more complete example, please see ...

## Running the Unit test example
