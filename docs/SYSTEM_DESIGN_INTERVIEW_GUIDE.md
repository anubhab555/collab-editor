# System Design Interview Guide

Use this document after you read [Architecture](./ARCHITECTURE.md).

This file is for interview preparation, not for describing every implementation detail.
It focuses on:

- which design patterns the project uses
- how to explain the system at HLD level
- how to explain the system at LLD level
- what questions an interviewer is likely to ask
- what you can honestly claim today

## First Honest Summary

Today, this project is best described as:

- a layered real-time collaborative editor
- using Socket.io for event-driven communication
- using Yjs for CRDT-based content sync
- using Yjs awareness for ephemeral presence and cursor state
- using MongoDB for persistence
- using Redis pub/sub for horizontal scaling of Socket.io events
- using timed version history with live restore
- using a dedicated cursor manager with drift correction on top of awareness state
- using JWT authentication with document owner/editor authorization

Today, it is not yet:

- a fully production-hardened auth platform with password reset, OAuth, refresh-token rotation, and audit logs
- a production container orchestration setup beyond Docker Compose

That honesty helps a lot in interviews.

## Design Patterns Used In This Project

### 1. Layered architecture

The backend is split into:

- config
- models
- services
- controllers
- websocket handlers

Why this matters:

- responsibilities are separated
- business logic is not mixed directly into the server bootstrap
- realtime transport and persistence can evolve independently

What to say:

> I refactored the backend into a layered structure so connection setup, socket handling, persistence, and document operations were not coupled in one file.

### 2. Event-driven architecture

The realtime system is built around socket events such as:

- `get-document`
- `load-document`
- `yjs-update`
- `request-document-sync`
- `document-sync`
- `get-document-history`
- `document-history`
- `document-history-updated`
- `restore-version`
- `document-restored`
- `join-document`
- `awareness-update`
- `request-awareness-sync`
- `awareness-sync`
- `awareness-remove`
- `awareness-leave`

Why this matters:

- collaborative editing is naturally event-driven
- clients react to state changes instead of polling
- the model fits WebSocket communication well

What to say:

> The editor is event-driven. User actions become socket events, and the backend routes those events to the right document room.

### 3. Pub/sub pattern

Redis scaling uses pub/sub behind the Socket.io adapter.

Why this matters:

- one backend instance alone cannot share socket events with another
- Redis becomes the event propagation layer between Node.js processes

What to say:

> I used pub/sub through the Socket.io Redis adapter so socket events could propagate across multiple backend instances.

### 4. Adapter pattern

The Redis integration uses the Socket.io Redis adapter.

Why this matters:

- the core socket code does not need to know how cross-instance delivery is implemented
- Socket.io keeps the same room and emit semantics while the adapter handles distribution

What to say:

> The adapter pattern let me add horizontal scaling without rewriting the socket event layer.

### 5. Manager pattern on the frontend

`CursorManager` is effectively a small manager object for remote cursor state and rendering.

Why this matters:

- cursor rendering is isolated from the main editor component
- DOM-heavy cursor updates are handled outside normal React rendering
- batching with `requestAnimationFrame` improves rendering behavior

What to say:

> I extracted remote cursor logic into a dedicated manager so cursor transforms, lifecycle cleanup, and DOM rendering were handled in one place.

### 6. Room-based partitioning

Each document uses a Socket.io room keyed by `documentId`.

Why this matters:

- only users in the same document receive the same content and awareness events
- different documents remain isolated without needing separate servers

What to say:

> I partitioned realtime traffic by document room so collaboration is scoped cleanly and isolation comes from the transport layer itself.

### 7. Middleware pattern

HTTP requests and Socket.io handshakes use authentication middleware before reaching document logic.

Why this matters:

- auth logic is centralized instead of repeated in every handler
- sockets cannot join document rooms unless the JWT is valid
- REST APIs and realtime collaboration share the same identity model

What to say:

> I used middleware for both REST and Socket.io authentication so downstream document logic always receives a trusted authenticated user.

### 8. Service-layer authorization

Document permissions are enforced inside `documentService`, not only in the UI.

Why this matters:

- clients cannot bypass access control by emitting socket events directly
- load, save, history, restore, and share operations use the same permission rules
- backend tests can validate authorization without depending on React

What to say:

> I kept authorization in the service layer so every document operation has one consistent owner/editor access-control path.

## HLD: How To Explain The System

At high level, explain the system in 5 blocks:

1. client
2. realtime gateway
3. shared content model
4. scaling layer
5. persistence layer

Short version:

> The client is a React and Quill editor with auth, access, presence, and history sidebars. Quill is bound to a Yjs shared document for content sync, and a Yjs awareness instance carries ephemeral collaborator state like name and cursor position. The client talks to a Node.js Socket.io backend using a JWT-authenticated socket handshake. Each document maps to a Socket.io room after the backend confirms owner/editor access. MongoDB stores users, document access metadata, the active Yjs snapshot, and timed checkpoints for restore. When Redis is enabled, Socket.io uses Redis pub/sub so multiple backend instances can share realtime content and awareness events.

### HLD questions an interviewer may ask

#### What are the main system components?

Expected answer:

- React + Quill frontend
- JWT authentication and protected document APIs
- Yjs shared content model
- Socket.io backend
- Redis as scaling layer
- MongoDB for persistence and version history

#### How does realtime editing work end to end?

Expected answer:

- user types in Quill
- Quill is bound to a local Yjs document
- frontend emits a Yjs update
- backend broadcasts the update to the document room
- other clients apply the Yjs update
- local awareness state separately tracks user metadata and cursor position
- the document is autosaved periodically to MongoDB
- timed checkpoints provide restoreable history on top of the live state

#### How does access control work?

Expected answer:

- users register or log in and receive a JWT
- REST requests use `Authorization: Bearer <token>`
- Socket.io sends the token in the handshake auth payload
- backend middleware resolves the authenticated user
- the document service checks whether the user is the owner or an editor collaborator before load, save, history, restore, or share
- only owners can share documents with existing users by email

#### Why is Redis needed?

Expected answer:

- without Redis, one backend instance cannot deliver events to sockets connected to another instance
- Redis enables cross-instance event propagation

#### Why keep Socket.io even after adding Yjs?

Expected answer:

- Yjs solves shared-state convergence
- Socket.io still handles transport, rooms, reconnection behavior, and awareness transport
- this let the project keep its scaling story while upgrading the content model underneath it

#### What are the current limitations?

Expected answer:

- auth is JWT-based, but still not enterprise-grade auth
- deployment automation is still limited compared with a full production platform, even though the stack is now containerized with Docker Compose
- auth is intentionally simple and does not yet include reset flows, OAuth, refresh-token rotation, read-only roles, teams, or audit logs

#### How would you scale this further?

Expected answer:

- keep Redis for transport scaling
- build on the existing Dockerized stack
- add richer auth features such as invitations, roles, and audit logs
- later add orchestrated deployment and observability

## LLD: How To Explain The System

At low level, interviewers usually care about:

- event contracts
- state ownership
- data model
- lifecycle cleanup
- edge cases

### LLD areas they may ask about

#### How do you load a document?

Expected answer:

- client emits `get-document(documentId)`
- backend authenticates the socket and finds or creates the MongoDB document
- backend verifies owner/editor access or claims a legacy unowned document for the first authenticated opener
- backend loads a persisted Yjs snapshot, or converts a legacy Quill delta document into Yjs
- socket joins the room
- backend emits `load-document`
- frontend applies the Yjs baseline and enables editing
- backend can request a live peer sync so the client catches up beyond the last autosave

#### How does version history work?

Expected answer:

- the active document state is still autosaved every 2 seconds
- the backend creates a checkpoint only when content changed and 30 seconds have passed since the last checkpoint
- MongoDB keeps the latest 20 versions per document
- restore emits a room-wide update so all collaborators switch to the selected snapshot

#### How do you avoid leaking edits between documents?

Expected answer:

- each socket stores an active `documentId`
- content and awareness events are emitted to that document room only
- switching documents leaves the old room and joins the new one

#### How are cursors implemented?

Expected answer:

- client updates local Yjs awareness state with `{ user, cursor }`
- frontend emits throttled `awareness-update` messages over Socket.io
- backend forwards awareness updates to the same room except the sender
- frontend derives the active-collaborators roster from awareness state and stores remote cursor render state in `CursorManager`
- `CursorManager` renders DOM markers and cleans them up when awareness state is removed or the session changes

#### How do you reduce cursor drift?

Expected answer:

- when text changes arrive, remote cursor positions are transformed using Quill Delta position transforms
- this keeps cursors visually aligned while awareness updates continue to arrive asynchronously

#### Why not re-render cursors with React state on every update?

Expected answer:

- remote cursor updates can be frequent
- imperative DOM markers are cheaper here
- `requestAnimationFrame` batching reduces layout thrashing

#### Why autosave every 2 seconds instead of every keystroke?

Expected answer:

- writing every keystroke would create unnecessary database pressure
- periodic autosave is a simpler tradeoff for the current phase
- realtime sync and persistence are intentionally decoupled

#### What does MongoDB store?

Expected answer:

- one document per editor document
- a Yjs snapshot as the primary content format
- a Quill delta mirror for compatibility and inspection
- timed checkpoint versions plus restore-backup snapshots

#### What happens when Redis is down?

Expected answer:

- if `REDIS_URL` is set, backend startup fails loudly instead of silently downgrading
- if Redis is not configured at all, the app still works in single-node mode

## Questions You Should Be Ready To Answer

These are the most likely interview questions for this project.

### HLD-style questions

- Draw the architecture and explain the flow of an edit.
- Why did you choose Socket.io instead of plain WebSocket?
- Why is Redis needed for scaling?
- Why keep Socket.io and Redis after adding Yjs?
- Why use MongoDB here?
- How does live restore work without reloading the page?
- What are the bottlenecks in the current design?
- How would you take this to production?
- What is still missing after the Yjs phase?

### LLD-style questions

- What socket events exist and what do they do?
- How do you ensure document isolation?
- How do you catch up a newly joined client to the latest state?
- How do you avoid cursor flicker or drift?
- How do you clean up stale cursors?
- How do you sync presence for a newly joined collaborator?
- How do you create and cap version history?
- What happens to connected collaborators when one user restores a version?
- How is collaborator identity handled today?
- Why is autosave periodic instead of immediate?
- What happens if a user disconnects mid-edit?
- Where is authorization enforced and why not only in the frontend?
- How do legacy unowned documents behave after auth is added?

## Good Tradeoffs To Mention

Interviewers like hearing tradeoffs, not just features.

### Current good tradeoffs

- Socket.io over raw WebSocket for faster delivery and room support
- Yjs for correctness in content convergence
- MongoDB for fast iteration with JSON-shaped companion data
- periodic autosave instead of write-on-every-keystroke
- timed checkpoints instead of versioning every autosave tick
- Redis adapter only when scaling is needed
- custom cursor manager for performance-sensitive rendering on top of awareness state
- JWT auth as a simple first production-grade identity layer before adding OAuth or enterprise auth

### Current acknowledged limitations

- no password reset, OAuth, refresh-token rotation, read-only role, invitation flow, team model, or audit log yet
- no production observability stack yet

## What You Can Claim Today

You can honestly say:

- you built a real-time collaborative editor
- you modularized the backend into layered responsibilities
- you migrated content sync to Yjs-based CRDT updates
- you implemented Yjs awareness-based presence and remote cursor tracking with drift correction
- you added Redis-based cross-instance Socket.io scaling
- you added timed version history with live restore
- you built an automated test harness for backend service logic, socket events, and the history sidebar
- you added Playwright browser smoke tests for multi-client collaboration flows
- you documented single-node and Redis-scaled local validation flows
- you added JWT authentication and document-level owner/editor access control

You should not yet say:

- the system has enterprise-grade auth features such as OAuth, password reset, refresh-token rotation, or audit logs
- the system has production-grade deployment orchestration

## Fast Answer Templates

### If asked for the HLD in 30 seconds

> The system has a React and Quill frontend, a Node.js Socket.io realtime backend, JWT authentication, Yjs as the shared content and awareness model, MongoDB for users/document state/history, and optional Redis pub/sub for horizontal scaling. Each document maps to a socket room after access control passes, so content updates and awareness updates stay isolated by document ID.

### If asked for the LLD in 30 seconds

> At low level, the client authenticates, loads a persisted Yjs baseline by document ID, binds Quill to a local Yjs document, attaches a Yjs awareness instance for `{ user, cursor }`, emits Yjs updates for content, and emits throttled awareness updates for presence. The backend authenticates the socket, enforces owner/editor access before joining the room, broadcasts room-scoped events, stores autosaved Yjs state plus timed history checkpoints in MongoDB, and when Redis is enabled those events propagate across backend instances.

### If asked what the next serious engineering step is

> The next major steps are production hardening: observability, deployment automation, richer auth roles/invitations, and possibly audit logs now that content sync, presence, restoreable history, Docker packaging, and authenticated access control are already in place.
