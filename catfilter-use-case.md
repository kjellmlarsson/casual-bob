We are adding functionality to the @casual-bob/ application to illustrate transaction behaviour. 

We will have three casual queues - **incoming.facts**, **approved.cat.fact** and **incoming.facts.error** . 

When a message is enqueued on the incoming.facts queue it is immediately moved to approved.cat.fact if it contains the string "cat". Otherwise, it is moved to incoming.facts.error. A message leaves the incoming queue and arrives at either the approved or error queue at a single moment under a transaction.