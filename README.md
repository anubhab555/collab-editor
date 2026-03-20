# Collab Editor

## Setup
1. `cd backend && npm install`
2. `cd frontend && npm install`

## Local MongoDB Workflow
Use the root helper scripts for local development:

* `npm run mongo:start`
* `npm run mongo:status`
* `npm run mongo:stop`
* `npm run mongo:reset`

Notes:

* The default local connection string is `mongodb://127.0.0.1:27017/collab-editor`.
* Local MongoDB data is stored in `%LOCALAPPDATA%\collab-editor\mongo\data`.
* Local MongoDB logs are written to `%TEMP%\collab-editor-mongod.log`, not inside the repo.
* You do not need to keep a dedicated terminal open for Mongo if you use `npm run mongo:start`.
* MongoDB still needs to be running while the backend is running.
* The old repo-local `.local` Mongo folder is no longer needed by the normal workflow.
* If your machine already has the Windows `MongoDB` service running, you can skip `npm run mongo:start` entirely.
* `npm run mongo:reset` is only for the repo-managed fallback MongoDB process, not for a service-managed MongoDB install.

## Development
1. Make sure MongoDB is available:
   * If the Windows `MongoDB` service is already running, use that.
   * Otherwise start the repo-managed fallback process with `npm run mongo:start`.
2. Run backend: `cd backend && npm run devStart`
3. Run frontend: `cd frontend && npm start`

## Fresh Start
If you want to start with a clean local database:

1. If you are using the repo-managed fallback MongoDB process:
   * `npm run mongo:stop`
   * `npm run mongo:reset`
   * `npm run mongo:start`
2. If you are using the Windows `MongoDB` service:
   * do not use `mongo:reset`
   * clear the `collab-editor` database from MongoDB Compass if you need a clean start
3. `cd backend && npm run devStart`
4. `cd frontend && npm start`

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
* Two normal tabs in the same browser profile will usually look like the same collaborator, so they are not the right way to test "different users".
* To test different remote cursors, open the same document in two different browser storage contexts such as normal window + incognito, two browser profiles, or two different browsers.
* In production, a load balancer must support sticky sessions or use a WebSocket-aware proxy.

## Manual Test Flow
1. Make sure MongoDB is available through your normal local flow.
2. Open the same document in two tabs and verify text sync works live.
3. Open a different document in a third tab and verify it stays isolated.
4. Type, wait 2 seconds, refresh, and verify autosave restores the content.
5. Open the same document in two different browser storage contexts and verify remote cursors and labels appear.
6. Blur one editor, close one tab, or switch one tab to a different document and verify the remote cursor disappears.
7. After Redis is running locally, use the multi-instance flow below to verify cross-backend sync.

## Redis Scaling
* Set `REDIS_URL=redis://localhost:6379` to enable the Socket.io Redis adapter.
* When `REDIS_URL` is not set, the backend stays in single-node mode.
* When `REDIS_URL` is set, the backend retries Redis connection with bounded backoff and fails startup if Redis never becomes available.
* For local verification on this machine, Redis is started with Docker:
  * first run: `docker run --name collab-redis -p 6379:6379 -d redis:7`
  * later runs: `docker start collab-redis`
  * stop Redis for outage testing: `docker stop collab-redis`
* `docker stop collab-redis` is the recommended fail-loud test. Pausing Docker Engine can freeze dependencies instead of producing a clean Redis connection failure.
* Backend logs now call out Redis mode explicitly:
  * `[Redis] Running in single-node mode`
  * `[Redis] Connected to pub/sub`
  * `[Redis] Adapter enabled`

## Single-Node Without Redis
Use this when you want the app to run without the scaling layer:

1. Make sure MongoDB is running.
2. Start backend: `cd backend && npm run devStart`
3. Start frontend: `cd frontend && npm start`

This mode still supports:

* document editing
* cursor tracking
* autosave and reload

## Multi-Instance Local Verification
1. Start Redis on port `6379`:
   * first time: `docker run --name collab-redis -p 6379:6379 -d redis:7`
   * later: `docker start collab-redis`
2. Start backend instance 1: `cd backend && npm run devStart:redis`
3. Start backend instance 2: `cd backend && npm run devStart:redis:3002`
4. Start frontend instance 1: `cd frontend && npm start`
5. Start frontend instance 2: `cd frontend && npm run start:socket3002`
6. Open the same document in both frontends and verify text sync, cursor sync, and document persistence across backend instances.
7. Open a different document in one frontend and verify document isolation still holds.
8. Stop Redis with `docker stop collab-redis` and confirm `npm run devStart:redis` fails loudly instead of silently falling back.

Notes:

* `http://localhost:3000` and `http://localhost:3003` are both allowed by default in local multi-instance mode.
* Because the ports differ, they also use different browser storage and show different collaborator identities naturally.

## Environment Variables
* Backend
  * `SOCKET_PORT`: override backend Socket.io port
  * `CLIENT_ORIGIN`: comma-separated frontend origins for Socket.io CORS
  * `MONGODB_URI`: MongoDB connection string
  * `REDIS_URL`: enables Redis pub/sub scaling
* Frontend
  * `REACT_APP_SOCKET_URL`: override the Socket.io server URL for local multi-instance verification

## Documentation
* Architecture overview: `docs/ARCHITECTURE.md`
* Change history and interview notes: `docs/Design Flow.md`
* Local setup and test runbook: `docs/LOCAL_DEV_SETUP.md`
* Beginner study guide: `docs/LEARNING_PATH.md`
