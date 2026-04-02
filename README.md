# Collab Editor

## Setup
1. `npm install`
2. `cd backend && npm install`
3. `cd frontend && npm install`

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

## Docker Compose
Use this when you want the packaged full stack instead of separate local processes.

1. Make sure Docker Desktop and the Docker engine are running.
2. Start the stack: `npm run docker:up`
3. Open `http://localhost:3000`
4. Follow logs if needed: `npm run docker:logs`
5. Stop the stack: `npm run docker:down`

What runs in this mode:

* `frontend`: production React build served by Nginx
* `backend`: Node.js Socket.io server
* `mongodb`: persistent document store
* `redis`: realtime scaling layer

Notes:

* The frontend uses same-origin Socket.io in Docker mode, so Nginx proxies `/socket.io/` to the backend container.
* The backend also exposes `GET /healthz` for container health checks.
* `npm run docker:down` keeps MongoDB data by default because the Compose volume is preserved.

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
* Yjs-based CRDT content sync over Socket.io
* Yjs awareness-based live cursor sync and active collaborator roster
* Delta-aware remote cursor drift correction while users type concurrently
* MongoDB-backed document persistence with periodic autosave
* Timed version checkpoints with live restore for all active collaborators
* Production-style Docker Compose packaging for the full stack

## Content Sync Events
* `load-document`: receive the Yjs baseline payload for the active document
* `yjs-update`: send or receive CRDT updates for document content
* `request-document-sync`: request a live Yjs catch-up snapshot from existing peers
* `document-sync`: receive the first valid peer snapshot for a newly joined client
* `save-document`: persist a Yjs snapshot plus a Quill delta mirror

## Version History Events
* `get-document-history`: request version metadata for the active document
* `document-history`: receive the current version list for the sidebar
* `document-history-updated`: receive room-wide history refreshes after checkpoints or restore
* `restore-version`: request a live restore for the selected version
* `document-restored`: receive the restored Yjs snapshot for the active room

## Presence Events
* `join-document`: register collaborator metadata for the active document room
* `awareness-update`: send or receive Yjs awareness updates for cursors and live presence
* `request-awareness-sync`: request an awareness snapshot from active peers when a collaborator joins
* `awareness-sync`: send the current awareness snapshot back to the requesting collaborator
* `awareness-remove`: remove stale awareness states when collaborators leave, switch documents, or disconnect
* `awareness-leave`: explicitly clear the current session's ephemeral presence before teardown

## Identity and Scaling Notes
* User identity is persisted via `localStorage`, so the same browser session shares identity across tabs and documents.
* Two normal tabs in the same browser profile will usually look like the same collaborator, so they are not the right way to test "different users".
* To test different collaborator presence and remote cursors, open the same document in two different browser storage contexts such as normal window + incognito, two browser profiles, or two different browsers.
* In production, a load balancer must support sticky sessions or use a WebSocket-aware proxy.

## Manual Test Flow
1. Make sure MongoDB is available through your normal local flow.
2. Open the same document in two tabs and verify text sync works live.
3. Type concurrently in both tabs and verify the document converges cleanly instead of drifting.
4. Open a different document in a third tab and verify it stays isolated.
5. Type, wait 2 seconds, refresh, and verify autosave restores the content.
6. Open the same document in two different browser storage contexts and verify both names appear in the active-collaborators roster.
7. Move the caret in one editor and verify the other client shows the remote cursor label.
8. Blur one editor, close one tab, or switch one tab to a different document and verify the remote cursor disappears and the roster updates.
9. Join a third client after active edits but before the next autosave and verify it catches up to the latest in-memory state.
10. Keep editing for more than 30 seconds and verify a checkpoint appears in the history panel.
11. Restore an older version and verify every open client on the same document updates immediately.
12. Refresh after restore and verify the restored content persists.
13. If you already have older documents saved before the Yjs migration, reopen one and verify it still loads, resaves, and starts accumulating history correctly.
14. After Redis is running locally, use the multi-instance flow below to verify cross-backend sync.

## Automated Testing
Use the automated harness for fast feedback before running browser smoke tests:

* Backend service + socket tests: `cd backend && npm test`
* Frontend version-history panel tests: `cd frontend && npm run test:ci`
* Combined unit/integration run from the repo root: `npm test`
* Single-node browser E2E smoke: `npm run e2e:single`
* Redis-backed browser E2E smoke: `npm run e2e:redis`
* Docker Compose browser E2E smoke: `npm run e2e:docker`

Current automated coverage includes:

* checkpoint creation and retention rules
* restore-backup behavior
* history fetch and room-wide restore socket events
* presence-roster rendering and version-history sidebar behavior
* real browser multi-context collaboration smoke in single-node mode
* Redis-backed cross-backend browser smoke when Docker Desktop and the engine are running
* Docker Compose full-stack browser smoke through the packaged Nginx + backend stack

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
* awareness-based presence and remote cursors
* autosave and reload

## Multi-Instance Local Verification
1. Start Redis on port `6379`:
   * first time: `docker run --name collab-redis -p 6379:6379 -d redis:7`
   * later: `docker start collab-redis`
2. Start backend instance 1: `cd backend && npm run devStart:redis`
3. Start backend instance 2: `cd backend && npm run devStart:redis:3002`
4. Start frontend instance 1: `cd frontend && npm start`
5. Start frontend instance 2: `cd frontend && npm run start:socket3002`
6. Open the same document in both frontends and verify text sync, concurrent typing convergence, active-user roster sync, cursor sync, and document persistence across backend instances.
7. Keep editing for more than 30 seconds and verify the history list updates across both frontend instances.
8. Restore a version from one frontend and verify the other frontend receives both the restored content and updated history list.
9. Join a third client after active edits but before autosave and verify peer catch-up still brings it to the latest state.
10. Open a different document in one frontend and verify document isolation still holds.
11. Stop Redis with `docker stop collab-redis` and confirm `npm run devStart:redis` fails loudly instead of silently falling back.

Notes:

* `http://localhost:3000` and `http://localhost:3003` are both allowed by default in local multi-instance mode.
* Because the ports differ, they also use different browser storage and show different collaborator identities naturally.

## Environment Variables
* Backend
  * `SOCKET_PORT`: override backend Socket.io port
  * `CLIENT_ORIGIN`: comma-separated frontend origins for Socket.io CORS
  * `MONGODB_URI`: MongoDB connection string
  * `REDIS_URL`: enables Redis pub/sub scaling
  * `CHECKPOINT_INTERVAL_MS`: override timed version checkpoint cadence
* Frontend
  * `REACT_APP_SOCKET_URL`: override the Socket.io server URL for local multi-instance verification
  * `REACT_APP_SAVE_INTERVAL_MS`: override autosave cadence at build time

## Documentation
* Architecture overview: `docs/ARCHITECTURE.md`
* Change history and interview notes: `docs/Design Flow.md`
* Local setup and test runbook: `docs/LOCAL_DEV_SETUP.md`
* HLD and LLD interview guide: `docs/SYSTEM_DESIGN_INTERVIEW_GUIDE.md`
* Beginner study guide: `docs/LEARNING_PATH.md`
