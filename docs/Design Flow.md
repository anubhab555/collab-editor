# Design Flow

This document is the running engineering and interview-prep log for the project.

Use it to track:
- what changed
- when it changed
- why it changed
- how to explain the change in an interview

## Learning Docs

Use these docs when you want to study the concepts, not just the change log:

- [Architecture](./ARCHITECTURE.md)
- [Local Dev Setup](./LOCAL_DEV_SETUP.md)
- [Learning Path](./LEARNING_PATH.md)
- [System Design Interview Guide](./SYSTEM_DESIGN_INTERVIEW_GUIDE.md)
- [Realtime Collaboration 101](./REALTIME_COLLABORATION_101.md)
- [Redis Scaling 101](./REDIS_SCALING_101.md)
- [CRDT and Yjs 101](./CRDT_YJS_101.md)
- [Docker and Kubernetes 101](./DOCKER_KUBERNETES_101.md)

## 2026-03-17 - Backend modularization
Status: Implemented

What changed:
- Split the backend into `config`, `models`, `services`, `controllers`, and `websocket`.
- Moved Socket.io event handling out of `server.js` into a dedicated socket handler.
- Kept the original editor behavior intact while improving separation of concerns.

Why it changed:
- The original backend was tutorial-style and too flat for production storytelling.
- A modular backend makes future realtime features easier to add safely.

Interview explanation:
- I refactored the backend into clear responsibility boundaries so realtime transport, persistence, and bootstrapping were not coupled in a single file.
- This was the foundation step that made later cursor tracking and scaling work easier to implement and reason about.

## 2026-03-18 - Cursor tracking and delta-aware drift correction
Status: Implemented

What changed:
- Added collaborator identity bootstrapping in the frontend.
- Added Socket.io events for `join-document`, `cursor-move`, `cursor-update`, and `cursor-remove`.
- Added a dedicated `CursorManager` to own remote cursor state and DOM marker rendering.
- Batched cursor DOM updates with `requestAnimationFrame`.
- Added delta-based cursor transformation using Quill Delta `transformPosition(...)` to reduce cursor drift during concurrent edits.
- Added blur, disconnect, and document-switch cleanup so stale cursors are removed quickly.

Why it changed:
- Cursor tracking makes the product feel like a real collaborative editor instead of a simple broadcast demo.
- Drift correction and cleanup are the difference between a demo feature and an interview-quality realtime feature.

Current behavior:
- User identity is persisted in `localStorage`.
- The same browser storage context reuses the same identity across tabs and documents.
- This is intentional for now because it models a stable user identity, not a per-tab guest identity.

Interview explanation:
- I implemented remote cursor tracking with throttled updates, socket room broadcasts, delta-aware position transforms, and a render manager that avoids layout thrashing.
- I handled lifecycle cleanup explicitly so cursors do not get stuck when users blur the editor, switch documents, or disconnect.

## 2026-03-20 - Documentation and interview flow
Status: Implemented

What changed:
- Added README notes describing the current identity behavior.
- Added a production note about sticky sessions or a WebSocket-aware proxy.
- Created this `Design Flow` file as the ongoing change log and explanation guide.

Why it changed:
- The project needs a clear written story, not just code, so it is easy to review before interviews.

Interview explanation:
- I maintained a change log that records design intent and tradeoffs, so I can explain not only what was built but why each system decision was made.

## 2026-03-20 - Redis adapter scaling
Status: Implemented

What changed:
- Added Redis-based Socket.io adapter support so multiple backend instances can share document and cursor events.
- Kept current single-node behavior when `REDIS_URL` is not configured.
- Added bounded Redis reconnect behavior using `Math.min(retries * 50, 2000)` to tolerate transient startup issues while still failing if Redis never becomes available.
- Added graceful shutdown so Redis pub/sub clients are closed on `SIGINT` and `SIGTERM`.
- Added explicit Redis logs for single-node mode, pub/sub connection, and adapter enablement.
- Made the frontend Socket.io base URL configurable with `REACT_APP_SOCKET_URL` for local multi-instance verification.
- Added local dev scripts to run two backend instances and a second frontend instance on a different port.
- Added default local CORS support for both `http://localhost:3000` and `http://localhost:3003`.
- Documented the Docker-based Redis runbook, including clean outage testing with `docker stop collab-redis`.

Why it changed:
- Cursor tracking and delta sync were still tied to one Node.js process.
- Redis is the scaling layer that lets realtime events propagate across multiple backend instances.
- The local verification path also needed to be explicit so the scaling story can be demonstrated reliably from scratch.

Interview explanation:
- I introduced the Socket.io Redis adapter so document and cursor events work across horizontally scaled Node.js instances.
- I made the setup operationally safer with bounded reconnect backoff, explicit mode logging, graceful shutdown, and a documented local validation flow using Docker-managed Redis.

Learning docs for this phase:

- [Architecture](./ARCHITECTURE.md)
- [Redis Scaling 101](./REDIS_SCALING_101.md)

## 2026-03-20 - Learning documentation expansion
Status: Implemented

What changed:
- Added beginner-friendly concept docs under `docs/` for realtime collaboration, Redis scaling, CRDT/Yjs, and Docker/Kubernetes.
- Added a learning path doc so the project can be studied in a structured order before interviews.
- Added a focused system design interview guide for HLD and LLD preparation.
- Updated the architecture doc so it reflects the current Redis-enabled system honestly and clearly.

Why it changed:
- A project is easier to defend in interviews when the concepts behind the code are documented in plain language.
- The earlier architecture doc needed Redis updates and clearer wording around what is already implemented versus what is still planned.

Interview explanation:
- I documented both the implementation and the underlying concepts so I can explain not just the code, but also the system design choices, limitations, and future roadmap in a structured way.

## 2026-03-20 - Local development workflow
Status: Implemented

What changed:
- Added root helper scripts to start, stop, inspect, and reset local MongoDB for development.
- Added a dedicated [Local Dev Setup](./LOCAL_DEV_SETUP.md) runbook that explains startup, reset flow, and manual testing.
- Kept runtime MongoDB data and logs out of the repo as part of the local development story.
- Documented how browser identity affects cursor testing so new contributors can validate the feature correctly.

Why it changed:
- New contributors need a clean way to run the project without reverse-engineering the local environment.
- The testing flow also needed to explain the current browser-identity behavior for cursor validation.

Interview explanation:
- I improved the local developer experience with a simple runbook and helper scripts so the project is easier to start, test, and explain.

Learning docs for this phase:

- [Local Dev Setup](./LOCAL_DEV_SETUP.md)
- [Architecture](./ARCHITECTURE.md)

## 2026-04-02 - Yjs awareness presence
Status: Implemented

What changed:
- Replaced the custom cursor socket channel with Yjs awareness updates carried over the existing Socket.io transport.
- Added a lightweight active-collaborators roster above version history in the editor sidebar.
- Kept `CursorManager`, but repointed it to awareness-derived collaborator state instead of custom cursor events.
- Added awareness peer-sync and cleanup flows so join, restore, document switch, blur, and disconnect all keep presence state clean.
- Extended automated coverage to include awareness relay, roster rendering, and browser-level presence behavior in both single-node and Redis-scaled modes.

Why it changed:
- Content had already moved to Yjs, so keeping presence on a separate custom channel left the collaboration model split in two.
- Moving presence to awareness makes the system easier to explain, closer to how mature collaborative editors are structured, and safer to evolve.

Interview explanation:
- I unified collaboration state around Yjs by keeping document content in the shared document and moving ephemeral user state like cursor position and active presence into Yjs awareness.
- I still kept a dedicated cursor renderer because awareness solves shared ephemeral state, but the DOM-heavy cursor painting path benefits from an imperative manager and local drift correction.

Learning docs for this phase:

- [Architecture](./ARCHITECTURE.md)
- [CRDT and Yjs 101](./CRDT_YJS_101.md)
- [System Design Interview Guide](./SYSTEM_DESIGN_INTERVIEW_GUIDE.md)

## 2026-03-21 - Yjs CRDT content sync
Status: Implemented

What changed:
- Replaced content sync based on raw Quill delta broadcast with Yjs-based CRDT updates.
- Kept the existing Socket.io and Redis architecture as the transport layer.
- Added backward-compatible MongoDB persistence with a Yjs snapshot plus a Quill delta mirror.
- Added a peer catch-up flow so newly joined clients can move beyond the last autosaved snapshot.
- Kept the current custom cursor system unchanged for this phase.

Why it changed:
- Redis solved transport scaling, but not collaboration correctness under concurrent edits.
- Yjs upgrades the system from event-based syncing to a real shared-state model for document content.

Interview explanation:
- I kept the existing WebSocket gateway and scaling story, but changed the content layer underneath it to Yjs so the document itself converges through a CRDT model instead of naive delta relay.

Learning docs for this phase:

- [Architecture](./ARCHITECTURE.md)
- [CRDT and Yjs 101](./CRDT_YJS_101.md)
- [System Design Interview Guide](./SYSTEM_DESIGN_INTERVIEW_GUIDE.md)

## 2026-04-02 - Version history and live restore
Status: Implemented

What changed:
- Added timed version checkpoints on top of the active Yjs document state.
- Stored version metadata and snapshots in MongoDB while keeping the current root document state as the live version.
- Added a basic history sidebar in the editor with timestamps, source labels, and restore actions.
- Added live restore so every connected collaborator switches to the restored version immediately.
- Added restore-backup snapshots so the pre-restore state is recoverable.

Why it changed:
- The project needed recovery and rollback, not just realtime sync.
- Version history makes the editor feel more product-ready and gives a stronger data-modeling story in interviews.

Interview explanation:
- I layered restoreable checkpoints on top of the Yjs collaboration model by keeping active state separate from version snapshots in MongoDB.
- Restore is a live room-wide action, so connected clients rebuild their Yjs session from the restored snapshot instead of relying on a page refresh.

Learning docs for this phase:

- [Architecture](./ARCHITECTURE.md)
- [Local Dev Setup](./LOCAL_DEV_SETUP.md)
- [System Design Interview Guide](./SYSTEM_DESIGN_INTERVIEW_GUIDE.md)

## 2026-04-02 - Automated test harness
Status: Implemented

What changed:
- Added backend automated tests for document-service rules such as timed checkpoints, retention, and restore backups.
- Added backend socket integration tests for history fetch, history update broadcast, and live restore broadcast.
- Extracted the version-history sidebar into its own frontend component and added focused UI tests for it.
- Added repeatable test commands for backend and frontend so feature validation is no longer manual-only.

Why it changed:
- The project had reached the point where manual smoke testing alone was too slow and too easy to miss regressions.
- A parallel test track makes future realtime and persistence changes safer to ship.

Interview explanation:
- I added an automated test harness around the highest-risk collaborative paths: persistence rules, room-scoped socket events, and the restore UI.
- That let the project move from demo-style manual validation toward an engineering workflow where new features can ship with regression coverage.

Learning docs for this phase:

- [Local Dev Setup](./LOCAL_DEV_SETUP.md)
- [Architecture](./ARCHITECTURE.md)
- [System Design Interview Guide](./SYSTEM_DESIGN_INTERVIEW_GUIDE.md)

## 2026-04-02 - Browser E2E automation
Status: Implemented

What changed:
- Added Playwright-based browser smoke tests for true multi-client collaboration.
- Added a root E2E runner that can boot MongoDB, backend and frontend processes, and then run the browser suite.
- Added a single-node browser smoke flow across two isolated browser contexts.
- Added a Redis-backed browser smoke flow across two frontends and two backends.
- Added fast test-only interval overrides so browser automation does not wait the full production-style checkpoint window.

Why it changed:
- Unit and socket tests are useful, but they do not prove that the browser, editor, sockets, and restore flow all work together end to end.
- The project needed at least one real browser automation path to back up the collaborative editing story.

Interview explanation:
- I added real browser E2E coverage on top of the unit and integration harness so the critical multi-client flows are tested at the user level, not just at the service and socket layers.
- The Redis-backed flow uses the same local multi-instance topology as the manual runbook, which makes the distributed-system story more credible.

Learning docs for this phase:

- [Local Dev Setup](./LOCAL_DEV_SETUP.md)
- [Architecture](./ARCHITECTURE.md)
