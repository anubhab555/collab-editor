# Redis Scaling 101

Redis is the fanout layer for multiple Spring Boot WebSocket servers.

## The Problem

WebSocket connections are stateful.

If user A connects to backend A and user B connects to backend B:

```text
User A -> Spring Boot A
User B -> Spring Boot B
```

Backend A cannot directly write to user B's WebSocket connection because that connection lives inside backend B.

## The Solution

Use Redis Pub/Sub:

```text
Spring Boot A publishes event
        v
Redis channel
        v
Spring Boot B receives event
        v
Spring Boot B sends to local WebSocket clients
```

## What Redis Stores

For this project, Redis does not store document content.

Redis only transports realtime messages between backend instances.

MongoDB stores durable document state.

## Redis Mode

Enable Redis fanout:

```text
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
```

Single backend mode:

```text
REDIS_ENABLED=false
```

## Why This Is A Good Interview Topic

It shows you understand:

* stateful WebSocket connections
* horizontal backend scaling
* Pub/Sub fanout
* difference between cache/transport/persistence
* why MongoDB and Redis have different responsibilities

## Interview Answer

> Redis Pub/Sub lets multiple Spring Boot WebSocket backends share room-scoped collaboration events. MongoDB remains the persistent database; Redis is only the low-latency fanout layer.
