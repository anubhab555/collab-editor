# System Design Interview Guide

This guide is written for the Java Spring Boot backend version.

## 30-Second HLD Answer

> The system is a collaborative document editor. The frontend uses React, Quill, and Yjs. Yjs handles CRDT-based convergence in the browser. The backend is Java Spring Boot. It authenticates users with JWT, authorizes document access, maintains WebSocket sessions, routes messages by document room, persists Yjs snapshots and version history in MongoDB, and uses Redis Pub/Sub to propagate realtime events across multiple backend instances.

## HLD Components

| Component | Purpose |
|---|---|
| React | UI, auth, dashboard, editor shell |
| Quill | Rich text editor |
| Yjs | CRDT collaboration engine |
| Spring Boot | Java backend and realtime gateway |
| Spring Security | JWT authentication |
| Spring WebSocket | Persistent realtime sessions |
| MongoDB | Users, documents, versions |
| Redis Pub/Sub | Cross-instance event fanout |
| Docker Compose | Local production-style runtime |

## Edit Flow

1. User types in Quill.
2. Yjs updates the local shared document.
3. React sends a WebSocket JSON message to Spring Boot.
4. Spring Boot verifies the authenticated session and document access.
5. Spring Boot sends the update to other users in the same document room.
6. Redis Pub/Sub forwards the event to other backend instances if scaling mode is enabled.
7. Other browsers apply the Yjs update.

## Why Java Backend?

Use this answer:

> I chose Java Spring Boot for the backend because it gives a production-style backend stack with strong support for security, WebSocket gateways, Redis, MongoDB, Gradle, testing, and operational endpoints. React remains JavaScript because it is the frontend layer, but backend system-design concepts are implemented in Java.

## Why Yjs If Backend Is Java?

Yjs is still useful because CRDT merging belongs close to the editor state in the browser.

The Java backend does not need to understand CRDT internals.

It handles:

* authentication
* authorization
* room routing
* Redis fanout
* persistence
* restore broadcasts

Good answer:

> Yjs owns convergence. Java owns backend control-plane responsibilities: who is allowed, where messages go, what gets persisted, and how events scale across instances.

## Redis Pub/Sub Explanation

Problem:

```text
User A connected to backend A
User B connected to backend B
```

Without Redis, backend A cannot directly send a WebSocket frame to users connected to backend B.

Solution:

```text
Backend A publishes event -> Redis -> Backend B receives event -> Backend B sends to its local clients
```

Good answer:

> Redis Pub/Sub is the cross-instance fanout layer for WebSocket events. It lets the system scale Spring Boot backend instances horizontally while preserving room-scoped realtime delivery.

## LLD: Backend Package Responsibilities

| Package | Responsibility |
|---|---|
| `auth` | Register, login, JWT issuing, rate limiting |
| `security` | JWT authentication filter and authenticated principal |
| `document` | Document metadata, access control, save, history, restore |
| `realtime` | WebSocket sessions, room maps, peer sync, Redis fanout |
| `config` | Spring Security, CORS, WebSocket, Redis, Mongo auditing |
| `ops` | Health, readiness, metrics |

## LLD: Document Access Control

Rules:

* every REST request must have a valid JWT
* every WebSocket connection must have a valid JWT
* every document has one owner
* owner can share by email
* collaborators can edit
* unauthorized users cannot load or join the document room

Why service-layer authorization matters:

> Authorization lives in `DocumentService`, not just the frontend, so direct API or WebSocket calls still go through the same permission checks.

## LLD: Version History

The active document stores:

* latest Yjs snapshot
* Quill delta mirror
* document metadata

Version entries store:

* version id
* timestamp
* saved by
* source
* Yjs snapshot
* Quill delta mirror

Restore flow:

1. user clicks restore
2. client emits `restore-version`
3. Java backend validates access
4. backend saves a restore backup if needed
5. backend replaces active snapshot
6. backend broadcasts `document-restored`
7. all clients rebuild their Yjs document from the restored snapshot

## LLD: Presence And Cursors

Presence is ephemeral.

It is not stored in MongoDB.

Flow:

1. frontend updates Yjs awareness state
2. frontend sends `awareness-update`
3. Java backend routes the update to the document room
4. other clients update active user roster and remote cursor markers
5. disconnect or document switch emits `awareness-remove`

## LLD: Operational Endpoints

* `/healthz`: is the Java process alive?
* `/readyz`: is MongoDB available?
* `/metrics`: how many sockets, rooms, memory, Redis mode, and runtime signals?

Good answer:

> I separated liveness from readiness because a process can be alive but not ready to serve traffic if MongoDB is down.

## Design Patterns Used

* Layered architecture
* Service-layer authorization
* Event-driven WebSocket communication
* Room-based partitioning
* Pub/Sub fanout with Redis
* Adapter-like separation between Yjs frontend updates and Java backend routing
* Repository pattern through Spring Data MongoDB
* Middleware/filter pattern through Spring Security

## Questions Interviewers May Ask

* Why Java Spring Boot for the backend?
* Why Yjs instead of implementing CRDT in Java?
* How does Redis help WebSocket scaling?
* How do you prevent unauthorized document access?
* How does a new user catch up to the latest in-memory state?
* How does version restore work without refreshing?
* What happens if Redis is down?
* What happens if MongoDB is down?
* Why store snapshots instead of every operation?
* What metrics would you monitor?

## What You Can Claim

You can claim:

* Java Spring Boot backend
* JWT authentication
* document-level authorization
* WebSocket realtime gateway
* Redis Pub/Sub horizontal fanout
* MongoDB persistence
* Yjs CRDT collaboration
* awareness-based presence and cursors
* version history and live restore
* Docker Compose packaging
* health, readiness, and metrics endpoints

Do not claim:

* Kubernetes is implemented
* OAuth is implemented
* password reset is implemented
* Java performs CRDT merges internally
* distributed tracing is implemented

## Best Resume Bullet

> Built a scalable CRDT-based collaborative editor using React, Yjs, Java Spring Boot WebSockets, Redis Pub/Sub, MongoDB, and JWT authentication with document-level access control, live presence, version history, and restore.
