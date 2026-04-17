# Design Flow

This is the Java-centered engineering story for the project.

Read this before interviews when you want to remember:

* what the system does
* why the backend is Java
* how the realtime architecture works
* how to explain the project confidently

## Final Project Direction

The final backend direction is Java Spring Boot.

The frontend remains React because React applications are normally written in JavaScript, but all backend engineering concepts are now Java-based:

* WebSocket gateway
* JWT auth
* authorization
* MongoDB persistence
* Redis Pub/Sub
* version history
* production readiness endpoints

That means backend interview questions can be answered in Java instead of JavaScript.

## Final Architecture

```text
React + Quill + Yjs
        v
Native WebSocket JSON protocol
        v
Spring Boot WebSocket Gateway
        v
Redis Pub/Sub
        v
MongoDB
```

## Phase 1 - Spring Boot Backend Foundation

What changed:

* Replaced the backend runtime with Java 21 and Spring Boot.
* Added Gradle as the backend build tool.
* Added Spring Web, Spring WebSocket, Spring Security, Spring Data MongoDB, Spring Data Redis, and Actuator.
* Added a layered Java package structure:
  * `auth`
  * `config`
  * `document`
  * `realtime`
  * `security`
  * `user`
  * `ops`

Why it matters:

* The backend now matches the language you want to defend in interviews.
* The project aligns with common Java backend expectations for SDE roles.
* The design is easier to connect to Spring Boot, Spring Security, Redis Pub/Sub, and system-design learning.

Interview explanation:

> I intentionally moved the backend to Java Spring Boot because I wanted the backend architecture to match the ecosystem I am strongest in. React remains JavaScript on the frontend, while backend concerns like WebSocket routing, auth, Redis, and MongoDB are implemented in Java.

## Phase 2 - JWT Authentication And Access Control

What changed:

* Added user registration and login.
* Passwords are hashed with BCrypt.
* JWTs are issued by the Spring Boot backend.
* Spring Security validates JWTs for protected REST APIs.
* WebSocket connections pass the JWT as a query parameter during connection.
* Documents have:
  * owner
  * editor collaborators
  * owner-only sharing by email

Why it matters:

* The project is no longer an open document-room demo.
* Every backend operation is tied to an authenticated user.
* Authorization is enforced in the service layer, not only in the UI.

Interview explanation:

> I used Spring Security and JWTs for authentication. Document authorization is enforced in the Java service layer, so users cannot bypass access control by directly calling REST APIs or WebSocket events.

## Phase 3 - Java WebSocket Collaboration Gateway

What changed:

* Replaced the realtime transport with Spring WebSocket.
* The frontend now speaks a native JSON WebSocket protocol.
* Each message uses this shape:

```json
{
  "event": "event-name",
  "payload": {}
}
```

* Yjs binary updates are sent as Base64 inside JSON.
* The Java backend treats Yjs updates as opaque binary payloads.
* The backend routes events by document room.

Why it matters:

* Yjs remains the CRDT layer.
* Java does not need to implement CRDT internals.
* Spring Boot is responsible for authentication, routing, persistence, and fanout.

Interview explanation:

> Yjs runs in the browser and produces CRDT updates. The Java backend does not need to understand the CRDT algorithm; it validates access, routes updates to the correct document session, persists snapshots, and fans messages out through Redis when scaled.

## Phase 4 - Redis Pub/Sub Scaling

What changed:

* Added Redis Pub/Sub fanout for WebSocket messages.
* Backend instances publish room-scoped events to Redis.
* Other backend instances receive the Redis message and deliver it to their local WebSocket sessions.

Why it matters:

Without Redis:

```text
Backend A only reaches clients connected to A
Backend B only reaches clients connected to B
```

With Redis:

```text
Backend A -> Redis Pub/Sub -> Backend B
```

Interview explanation:

> WebSocket connections are stateful and attached to one backend instance. Redis Pub/Sub lets multiple Spring Boot instances share realtime events, so users connected to different instances can still collaborate on the same document.

## Phase 5 - MongoDB Persistence And Version History

What changed:

* MongoDB stores document metadata, ownership, collaborators, current Yjs snapshot, and version history.
* The active document state stores the latest Yjs snapshot.
* Timed checkpoints store restoreable versions.
* Restore broadcasts a new Yjs snapshot to every collaborator in the room.

Why it matters:

* Realtime sync and persistence are separate.
* The app can recover after refresh.
* Users can restore previous document states.

Interview explanation:

> I persist the latest Yjs snapshot for reload durability and store timed checkpoints for version history. Restore is a live collaborative event, so every connected client rebuilds its local Yjs document from the restored snapshot.

## Phase 6 - Production Readiness

What changed:

* Added `/healthz`.
* Added `/readyz`.
* Added `/metrics`.
* Added auth write-rate limiting.
* Added Docker packaging for React, Spring Boot, MongoDB, and Redis.

Why it matters:

* The backend has a basic operations story.
* Docker Compose can health-check the backend.
* Metrics give a clear answer to monitoring questions.

Interview explanation:

> I added liveness, readiness, and metrics endpoints so the backend can be monitored in a production-style environment. This is not a full observability platform, but it is the right foundation for Prometheus, dashboards, and alerting later.

## Final Resume Story

Strong resume bullet:

> Built a scalable CRDT-based collaborative editor using React, Yjs, Java Spring Boot WebSockets, Redis Pub/Sub, MongoDB, and JWT authentication, supporting multi-user editing, live presence, version history, restore, and document-level access control.

Follow-up bullet:

> Implemented a Java realtime gateway with room-scoped WebSocket routing, Redis-backed cross-instance fanout, MongoDB-backed Yjs snapshot persistence, and production-readiness endpoints for health, readiness, and metrics.

## What To Say If Asked Why Java Backend

Use this:

> I chose Java Spring Boot for the backend because I wanted a production-style backend stack with strong support for security, WebSocket gateways, Redis, MongoDB, testing, and operational tooling. I kept React on the frontend because that is the natural ecosystem for browser UI, but the backend architecture and system-design concepts are implemented in Java.

## What Not To Overclaim

Do not say:

* Kubernetes is implemented.
* OAuth is implemented.
* Password reset is implemented.
* Distributed tracing is implemented.
* Java computes CRDT merges itself.

Say instead:

* Yjs handles CRDT convergence in the browser.
* Java routes, authorizes, persists, and scales the collaboration events.
* Redis Pub/Sub handles cross-instance fanout.
* MongoDB stores durable snapshots and version history.
