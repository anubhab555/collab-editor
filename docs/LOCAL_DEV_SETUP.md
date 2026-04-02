# Local Dev Setup

This doc explains how to run the project locally without mixing startup instructions and testing instructions together.

Use this when you want:

- the right startup flow for your environment
- a clean local reset flow
- a separate test checklist after the app is running

## Startup Modes

There are two normal ways to run the project locally.

### 1. Single-node mode

Use this when you want the app to work without Redis.

What runs:

1. MongoDB
2. one backend instance
3. one frontend instance

What you get:

- real-time editing
- remote cursors
- autosave and reload
- version checkpoints and live restore

What you do not get:

- cross-instance event propagation

### 2. Redis-scaled mode

Use this when you want to validate the distributed realtime flow.

What runs:

1. MongoDB
2. Redis
3. backend instance on `:3001`
4. backend instance on `:3002`
5. frontend instance on `:3000`
6. frontend instance on `:3003`

What you get:

- text sync across backend instances
- cursor sync across backend instances
- version history updates across backend instances
- proof that Socket.io events propagate through Redis pub/sub

## MongoDB

MongoDB stores the autosaved document state.

The backend defaults to:

```text
mongodb://127.0.0.1:27017/collab-editor
```

### If Windows MongoDB service is already running

Use that directly.
You do not need `npm run mongo:start`.

### If you need the repo-managed fallback MongoDB process

Run these from the repo root:

```bash
npm run mongo:start
npm run mongo:status
npm run mongo:stop
npm run mongo:reset
```

Notes:

- `mongo:start` is a fallback local `mongod` flow
- `mongo:reset` is only for the repo-managed fallback MongoDB process
- local fallback MongoDB data lives in `%LOCALAPPDATA%\collab-editor\mongo\data`
- local fallback MongoDB logs live in `%TEMP%\collab-editor-mongod.log`

## Redis

Redis is only needed for Redis-scaled mode.

For local development on this machine, Redis is started with Docker.

### Redis Docker commands

First-time container creation:

```bash
docker run --name collab-redis -p 6379:6379 -d redis:7
```

Normal daily start:

```bash
docker start collab-redis
```

Stop Redis:

```bash
docker stop collab-redis
```

Important:

- `docker stop collab-redis` is the recommended outage test
- pausing Docker Engine is not the best failure simulation because it can freeze dependencies instead of producing a clean Redis connection failure

## Startup Flows

### Single-node startup

#### Service-managed MongoDB

```bash
cd backend
npm run devStart
cd ../frontend
npm start
```

#### Repo-managed fallback MongoDB

```bash
npm run mongo:start
cd backend
npm run devStart
cd ../frontend
npm start
```

### Redis-scaled startup

1. Start Redis:

```bash
docker start collab-redis
```

2. Make sure MongoDB is available:

- if Windows MongoDB service is running, use that
- otherwise run `npm run mongo:start`

3. Start backend instance 1:

```bash
cd backend
npm run devStart:redis
```

4. Start backend instance 2:

```bash
cd backend
npm run devStart:redis:3002
```

5. Start frontend instance 1:

```bash
cd frontend
npm start
```

6. Start frontend instance 2:

```bash
cd frontend
npm run start:socket3002
```

Notes:

- the backend allows both `http://localhost:3000` and `http://localhost:3003` by default for this flow
- `localhost:3000` and `localhost:3003` are different origins, so they naturally use different browser storage and appear as different collaborators

## Clean Start Flow

### If you are using the repo-managed fallback MongoDB process

```bash
npm run mongo:reset
npm run mongo:start
cd backend
npm run devStart
cd ../frontend
npm start
```

### If you are using the Windows MongoDB service

Do not use `mongo:reset`, because that script is file-based and is meant for the repo-managed fallback process.

Instead:

1. keep the MongoDB service running
2. clear the `collab-editor` database from MongoDB Compass if you want a clean app state
3. start the backend and frontend normally

## Collaborator Identity Note

The current cursor system stores collaborator identity in `localStorage`.

That means:

- the same browser profile reuses the same `clientId`
- normal tabs in the same browser often look like the same user
- remote cursor updates for your own `clientId` are intentionally ignored

If you want to test different collaborators in single-node mode, use:

- normal window plus incognito/private window
- two browser profiles
- or two different browsers

In Redis-scaled mode, `localhost:3000` and `localhost:3003` already count as different origins, so they naturally behave like different collaborators.

## Testing

### Automated test commands

Run these before manual smoke testing:

```bash
cd backend
npm test

cd frontend
npm run test:ci
```

Current automated coverage includes:

- backend document-service rules for checkpoints, retention, and restore backups
- backend socket integration for history fetch, history update broadcast, and live restore broadcast
- frontend version-history sidebar rendering and restore-button behavior
- Playwright single-node browser smoke across two isolated browser contexts
- Playwright Redis-backed browser smoke across `localhost:3000` and `localhost:3003`

### Browser E2E commands

Run these from the repo root:

```bash
npm run e2e:single
npm run e2e:redis
npm run e2e
```

Notes:

- `e2e:single` starts MongoDB if needed, then boots one backend and one frontend, and runs the Playwright multi-context collaboration smoke test
- `e2e:redis` starts MongoDB if needed, expects Docker Desktop and the Docker engine to be running, ensures the `collab-redis` container is available, then boots two backends and two frontends before running the cross-backend Playwright smoke test
- `e2e` runs the single-node suite first and then the Redis-backed suite

### Single-node checklist

1. Start MongoDB, backend, and frontend.
2. Open the same document in two tabs and verify text sync works in real time.
3. Type concurrently in both tabs and verify the document converges cleanly.
4. Open a different document in a third tab and verify it stays isolated.
5. Type in a document, wait 2 seconds, refresh, and verify the document reloads from MongoDB.
6. Open the same document in two different browser storage contexts and verify remote cursors appear.
7. Move the caret, type before another user's caret, and verify cursor drift correction looks reasonable.
8. Blur one editor, close one tab, or switch one tab to another document and verify the old cursor disappears.
9. Join a third client after active edits but before autosave and verify it catches up to the latest in-memory state.
10. Keep editing for more than 30 seconds and verify a checkpoint appears in the history panel.
11. Restore an older version and verify the document updates immediately without a page refresh.
12. Refresh after restore and verify the restored content persists.
13. If you have a document created before the Yjs migration, reopen it and verify it still loads, resaves, and starts accumulating history correctly.

### Redis-scaled checklist

1. Start Redis, MongoDB, both backends, and both frontends.
2. Open the same document in `localhost:3000` and `localhost:3003`.
3. Verify text sync works across backend instances.
4. Type concurrently in both frontends and verify the document converges correctly across backends.
5. Verify cursor sync works across backend instances.
6. Keep editing for more than 30 seconds and verify the history panel updates across both frontend instances.
7. Restore a version from one frontend and verify the second frontend updates immediately.
8. Join a third client after active edits but before autosave and verify peer catch-up still works.
9. Open a different document in one frontend and verify document isolation still holds.
10. Edit from both frontends, wait 2 seconds, refresh, and verify persistence still works.

### Redis failure test

1. Stop Redis:

```bash
docker stop collab-redis
```

2. Rerun:

```bash
cd backend
npm run devStart:redis
```

3. Confirm the backend fails loudly instead of silently falling back.

## What To Test Next

After the current Yjs validation, the next meaningful improvements are:

- moving presence and cursor state toward Yjs awareness
- Dockerized packaging for frontend, backend, Redis, and MongoDB

That keeps the roadmap focused on presence correctness and production packaging now that transport scaling, CRDT content sync, and restoreable history are already in place.
