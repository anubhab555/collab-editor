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
- [Learning Path](./LEARNING_PATH.md)
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

Why it changed:
- Cursor tracking and delta sync were still tied to one Node.js process.
- Redis is the scaling layer that lets realtime events propagate across multiple backend instances.

Interview explanation:
- I introduced the Socket.io Redis adapter so document and cursor events work across horizontally scaled Node.js instances.
- I made the setup operationally safer with bounded reconnect backoff, explicit mode logging, and graceful shutdown for the Redis clients.

Learning docs for this phase:

- [Architecture](./ARCHITECTURE.md)
- [Redis Scaling 101](./REDIS_SCALING_101.md)

## 2026-03-20 - Learning documentation expansion
Status: Implemented

What changed:
- Added beginner-friendly concept docs under `docs/` for realtime collaboration, Redis scaling, CRDT/Yjs, and Docker/Kubernetes.
- Added a learning path doc so the project can be studied in a structured order before interviews.
- Updated the architecture doc so it reflects the current Redis-enabled system honestly and clearly.

Why it changed:
- A project is easier to defend in interviews when the concepts behind the code are documented in plain language.
- The earlier architecture doc needed Redis updates and clearer wording around what is already implemented versus what is still planned.

Interview explanation:
- I documented both the implementation and the underlying concepts so I can explain not just the code, but also the system design choices, limitations, and future roadmap in a structured way.
