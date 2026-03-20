# Local Dev Setup

This doc explains how to run the project locally without getting stuck on MongoDB setup details.

Use this when you want:

- a clean startup flow
- a clean reset flow
- a practical checklist for manual testing

## What Needs To Be Running

For the current single-node version, you need:

1. local MongoDB
2. backend server
3. frontend server

Later, when you test Redis scaling, you will also need Redis and a second backend/frontend instance.

## Redis In This Project

Redis is the scaling layer for Socket.io.

It is not needed for:

- single-node editing
- single-node cursor tracking
- MongoDB autosave

It is needed for:

- cross-instance realtime sync between backend `:3001` and backend `:3002`
- cross-instance cursor propagation
- proving the system can scale beyond one Node.js process

For local development on this machine, the Redis workflow uses Docker.

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
- pausing Docker Engine is not the best failure simulation because it can freeze dependencies instead of producing a clean Redis connection error

## MongoDB In This Project

MongoDB is used for document persistence.

Today, the editor autosaves the Quill document to MongoDB every 2 seconds.
That means:

- if MongoDB is down, the backend cannot start
- if MongoDB is up, reloads can restore saved document content

For local development, this repo now includes helper scripts so you do not need to manually type a long `mongod` command every time.

If your machine already has the Windows `MongoDB` service installed and running, you can use that directly and skip the helper startup step.

## Local MongoDB Commands

Run these from the repo root:

```bash
npm run mongo:start
npm run mongo:status
npm run mongo:stop
npm run mongo:reset
```

What they do:

- `mongo:start`: starts MongoDB in the background on `127.0.0.1:27017`
- `mongo:status`: tells you whether MongoDB is running
- `mongo:stop`: stops the local `mongod` process listening on port `27017`
- `mongo:reset`: stops local MongoDB, deletes the local data files, and gives you a fresh empty local database

Important:

- these helper commands are for the repo-managed fallback MongoDB process
- if Windows `MongoDB` service is already running, `mongo:start` becomes a no-op and `mongo:reset` is not the right reset path

## Where Local Mongo Files Live

- local data: `%LOCALAPPDATA%\collab-editor\mongo\data`
- local log: `%TEMP%\collab-editor-mongod.log`

Both are intentionally kept outside the repo so your workspace stays cleaner.

## Default Local Connection String

The backend defaults to:

```text
mongodb://127.0.0.1:27017/collab-editor
```

You can override that with `MONGODB_URI` if needed later.

## About The Old `.local` Folder

The project no longer needs MongoDB data inside the repo.

Earlier, a repo-local `.local/mongo` directory was used for convenience during development.
That made cleanup and git status noisier than it needed to be.

Now:

- local MongoDB data lives in `%LOCALAPPDATA%`
- local MongoDB logs live in `%TEMP%`
- `.local/` is ignored by git

If an old `.local/mongo` folder still exists from earlier runs, `npm run mongo:reset` will clean it up.

## Clean Start Flow

If you want to start the app from a clean local state:

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

## Normal Daily Start Flow

If you already have local data and just want to run the app:

### Service-managed MongoDB

```bash
cd backend
npm run devStart
cd ../frontend
npm start
```

### Repo-managed fallback MongoDB

```bash
npm run mongo:start
cd backend
npm run devStart
cd ../frontend
npm start
```

You do not need a dedicated terminal for MongoDB when you use `mongo:start`, because it runs in the background.
You do still need MongoDB to be running whenever the backend is running.

## Single-Node Mode Without Redis

This is the default mode when `REDIS_URL` is not set.

Use it when you want the app to run without the distributed scaling layer:

```bash
cd backend
npm run devStart
cd ../frontend
npm start
```

This mode still supports:

- real-time editing
- remote cursors
- autosave and reload

It just does not propagate events across multiple backend instances.

## Why You May Not See Different Cursors

The current cursor system stores collaborator identity in `localStorage`.

That means:

- the same browser profile reuses the same `clientId`
- normal tabs in the same browser often look like the same user
- remote cursor updates for your own `clientId` are intentionally ignored

So if you want to test truly different collaborators, do this:

- open the same document in a normal browser window and an incognito/private window
- or use two different browser profiles
- or use two different browsers

That is the correct way to test different remote cursors with the current implementation.

## Manual Test Checklist

### Single-node tests

1. Start MongoDB, backend, and frontend.
2. Open the same document in two tabs and verify text sync works in real time.
3. Open a different document in a third tab and verify it stays isolated.
4. Type in a document, wait 2 seconds, refresh, and verify the document reloads from MongoDB.
5. Open the same document in two different browser storage contexts and verify remote cursors appear.
6. Move the caret, type before another user's caret, and verify cursor drift correction looks reasonable.
7. Blur one editor, close one tab, or switch one tab to another document and verify the old cursor disappears.

### Redis scaling tests

Run these only after Redis is running locally through Docker:

1. `docker start collab-redis`
2. `npm run mongo:start`
3. `cd backend && npm run devStart:redis`
4. `cd backend && npm run devStart:redis:3002`
5. `cd frontend && npm start`
6. `cd frontend && npm run start:socket3002`
7. Open the same document in both frontend instances and verify text sync and cursor sync still work across backend instances.
8. Open a different document in one frontend and verify document isolation still holds.
9. Edit from both frontends, wait 2 seconds, refresh, and verify persistence still works.
10. Stop Redis with `docker stop collab-redis`, then rerun `npm run devStart:redis` and confirm startup fails loudly.

The backend now allows both `http://localhost:3000` and `http://localhost:3003` by default for this local flow.
If you need custom frontend origins later, set backend `CLIENT_ORIGIN` as a comma-separated list.

### Redis-scaled local startup summary

```bash
docker start collab-redis
cd backend && npm run devStart:redis
cd backend && npm run devStart:redis:3002
cd frontend && npm start
cd frontend && npm run start:socket3002
```

## What To Test Next

After you finish the single-node cursor tests, the next meaningful test is Redis multi-instance verification.

After that, the next implementation phase is:

- Yjs and CRDT-based collaboration

That phase will improve correctness under concurrent edits, not just transport and scaling.
