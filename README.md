# Collab Editor

## Setup
1. `cd backend && npm install`
2. `cd frontend && npm install`

## Development
* Run Backend: `cd backend && npm run dev`
* Run Frontend: `cd frontend && npm start`

## Features
* Real-time collaborative editing with Quill deltas over Socket.io
* Live remote cursor tracking with browser-persisted collaborator names
* Delta-aware cursor drift correction while users type concurrently
* MongoDB-backed document persistence with periodic autosave

## Cursor Tracking Events
* `join-document`: register collaborator metadata for the active document room
* `cursor-move`: send throttled caret updates for the current collaborator
* `cursor-update`: receive remote collaborator cursor positions
* `cursor-remove`: remove remote cursors when collaborators blur, switch documents, or disconnect

## Identity and Scaling Notes
* User identity is persisted via `localStorage`, so the same browser session shares identity across tabs and documents.
* In production, a load balancer must support sticky sessions or use a WebSocket-aware proxy.

## Redis Scaling
* Set `REDIS_URL=redis://localhost:6379` to enable the Socket.io Redis adapter.
* When `REDIS_URL` is not set, the backend stays in single-node mode.
* When `REDIS_URL` is set, the backend retries Redis connection with bounded backoff and fails startup if Redis never becomes available.
* Backend logs now call out Redis mode explicitly:
  * `[Redis] Running in single-node mode`
  * `[Redis] Connected to pub/sub`
  * `[Redis] Adapter enabled`

## Multi-Instance Local Verification
1. Start Redis locally on port `6379`.
2. Start backend instance 1: `cd backend && npm run devStart:redis`
3. Start backend instance 2: `cd backend && npm run devStart:redis:3002`
4. Start frontend instance 1: `cd frontend && npm start`
5. Start frontend instance 2: `cd frontend && npm run start:socket3002`
6. Open the same document in both frontends and verify text sync, cursor sync, and document persistence across backend instances.

## Environment Variables
* Backend
  * `SOCKET_PORT`: override backend Socket.io port
  * `CLIENT_ORIGIN`: allowed frontend origin for CORS
  * `MONGODB_URI`: MongoDB connection string
  * `REDIS_URL`: enables Redis pub/sub scaling
* Frontend
  * `REACT_APP_SOCKET_URL`: override the Socket.io server URL for local multi-instance verification

## Documentation
* Architecture overview: `docs/ARCHITECTURE.md`
* Change history and interview notes: `docs/Design Flow.md`
* Beginner study guide: `docs/LEARNING_PATH.md`
