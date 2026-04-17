# Local Dev Setup

This runbook is for the Java Spring Boot backend version.

## Prerequisites

Install:

* Java 21
* Node.js for React frontend tooling
* MongoDB
* Docker Desktop, if you want Redis or Docker Compose mode

No global Gradle install is required. Use the checked-in Gradle wrapper: `backend/gradlew.bat` on Windows or `backend/gradlew` on Unix-like shells.

## Install Frontend Dependencies

```bash
cd frontend
npm install
```

The backend uses Gradle, so there is no backend `npm install`.

## MongoDB

Default URI:

```text
mongodb://127.0.0.1:27017/collab-editor
```

Repo helper scripts:

```bash
npm run mongo:start
npm run mongo:status
npm run mongo:stop
npm run mongo:reset
```

If your Windows MongoDB service is already running, you can skip `npm run mongo:start`.

## Single Backend Startup

Terminal 1:

```bash
npm run mongo:start
```

Terminal 2:

```bash
cd backend
.\gradlew.bat bootRun
```

Terminal 3:

```bash
cd frontend
npm start
```

Open:

```text
http://localhost:3000
```

On Unix-like shells, use `./gradlew bootRun`.

## Redis-Scaled Startup

Start Redis:

```bash
docker start collab-redis
```

If needed:

```bash
docker run --name collab-redis -p 6379:6379 -d redis:7
```

Backend A:

```bash
cd backend
.\gradlew.bat bootRun --args="--SOCKET_PORT=3001 --REDIS_ENABLED=true --REDIS_URL=redis://127.0.0.1:6379 --CLIENT_ORIGIN=http://localhost:3000,http://localhost:3003,http://127.0.0.1:3000,http://127.0.0.1:3003"
```

Backend B:

```bash
cd backend
.\gradlew.bat bootRun --args="--SOCKET_PORT=3002 --REDIS_ENABLED=true --REDIS_URL=redis://127.0.0.1:6379 --CLIENT_ORIGIN=http://localhost:3000,http://localhost:3003,http://127.0.0.1:3000,http://127.0.0.1:3003"
```

Frontend A:

```bash
cd frontend
npm start
```

Frontend B:

```bash
cd frontend
npm run start:backend3002
```

Open:

* `http://localhost:3000`
* `http://localhost:3003`

## Docker Compose Startup

```bash
npm run docker:up
npm run docker:logs
npm run docker:down
```

Docker Compose builds the Spring Boot backend with the Gradle wrapper inside Docker.

## Manual Smoke Test

1. Register user A.
2. Create or open a document.
3. Register user B in another browser profile or another frontend origin.
4. Share the document with user B's email.
5. Open the shared document as user B.
6. Type from both users and verify content sync.
7. Verify the active collaborator list.
8. Move cursors and verify remote cursor labels.
9. Wait for autosave, refresh, and verify persistence.
10. Keep editing long enough for a checkpoint.
11. Restore an older version and verify both users update live.

## Redis Smoke Test

1. Run two Spring Boot backend instances with `REDIS_ENABLED=true`.
2. Run two frontend instances on `3000` and `3003`.
3. Open the same shared document from both frontends.
4. Verify edits, presence, history updates, and restore events cross backend instances.
5. Stop Redis with:

```bash
docker stop collab-redis
```

Then restart a Redis-enabled backend and verify it fails loudly if Redis is unavailable.

## Operational Checks

Backend:

```text
http://localhost:3001/healthz
http://localhost:3001/readyz
http://localhost:3001/metrics
```

Expected:

* `/healthz` returns `status: ok`
* `/readyz` returns `status: ready` when MongoDB is connected
* `/metrics` returns Prometheus-style metrics

## Tests

Backend:

```bash
npm run test:backend
```

Frontend:

```bash
npm run test:frontend
cd frontend
npm run build
```

E2E:

```bash
npm run e2e:single
npm run e2e:redis
npm run e2e:docker
```

## Common Issues

### Gradle command confusion

Use the checked-in wrapper from the backend folder:

```bash
cd backend
.\gradlew.bat bootRun
```

On Unix-like shells, use `./gradlew bootRun`.

### WebSocket does not connect

Check:

* frontend `REACT_APP_SOCKET_URL`
* backend `CLIENT_ORIGIN`
* valid JWT in browser storage
* backend is running on the expected port

### Redis mode does not sync across instances

Check:

* `REDIS_ENABLED=true`
* `REDIS_URL=redis://127.0.0.1:6379`
* Redis container is running
* both backends use the same MongoDB database
