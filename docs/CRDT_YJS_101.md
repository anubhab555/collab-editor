# CRDT And Yjs 101

Yjs is the CRDT library used by the browser editor.

## What Problem Does A CRDT Solve?

Collaborative editors have concurrent edits.

Example:

```text
User A types at the start
User B types at the end
Both actions happen at nearly the same time
```

A naive backend can overwrite one user's change.

A CRDT lets all clients merge operations and converge to the same final document.

## Where Yjs Runs

In this project, Yjs runs in the React frontend.

The Java backend does not implement the CRDT algorithm.

That is intentional.

The split is:

| Layer | Responsibility |
|---|---|
| Yjs in browser | CRDT merge and convergence |
| Spring Boot | authentication, authorization, routing, persistence |
| MongoDB | durable Yjs snapshots and version history |
| Redis | cross-instance fanout |

## What Is A Yjs Update?

A Yjs update is a compact binary change.

Because the Java WebSocket protocol uses JSON, the frontend sends binary Yjs updates as Base64:

```json
{
  "update": {
    "__binaryBase64": "..."
  }
}
```

The Java backend treats this as an opaque payload.

It does not parse or modify the CRDT operation.

## Persistence

The frontend periodically sends:

* full Yjs snapshot as Base64
* Quill delta mirror for readability/debugging

MongoDB stores both.

## Restore

When a version is restored:

1. Java backend loads the stored Yjs snapshot.
2. Java backend broadcasts `document-restored`.
3. Every browser rebuilds its Yjs document from that snapshot.

## Interview Answer

> Yjs handles CRDT correctness in the browser. The Java backend treats Yjs updates as opaque binary payloads and focuses on secure routing, Redis fanout, persistence, and restore.
