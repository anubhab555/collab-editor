# Realtime Collaboration 101

This project uses a Java Spring Boot WebSocket backend.

## What Is A WebSocket?

HTTP request/response is short-lived:

```text
client asks -> server responds -> connection ends
```

WebSocket is long-lived:

```text
client connects -> connection stays open -> both sides send messages
```

That is useful for collaborative editing because edits must appear immediately.

## What Is A Document Room?

A room is a group of WebSocket sessions editing the same document.

```text
document A room: user 1, user 2
document B room: user 3
```

Events from document A should not reach document B.

The Java backend keeps room membership in memory and uses Redis Pub/Sub to share room events across backend instances.

## What Does Yjs Do?

Yjs is the CRDT layer.

It handles concurrent edits in the browser.

The Java backend does not merge text manually.

Instead:

1. browser creates a Yjs update
2. browser sends it to Spring Boot
3. Spring Boot relays it to authorized collaborators
4. each browser applies the update
5. Yjs converges the document state

## What Does Spring Boot Do?

Spring Boot owns backend responsibilities:

* validate JWT
* check document access
* maintain WebSocket sessions
* route events by document id
* publish events to Redis
* persist snapshots to MongoDB
* broadcast restore events

## Presence And Cursor Flow

Presence uses Yjs awareness.

Flow:

1. user moves cursor
2. frontend updates awareness state
3. frontend sends `awareness-update`
4. Spring Boot relays it to the document room
5. other clients render remote cursor labels

Presence is ephemeral and is not persisted.

## Interview Answer

> The realtime layer uses Spring Boot WebSockets. The browser owns Yjs CRDT state, and the backend owns authenticated room-based routing. Redis Pub/Sub lets multiple backend instances exchange those room events.
