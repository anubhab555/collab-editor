# Collab Editor

A real-time collaborative editor with a React frontend and a Java Spring Boot backend.

The backend story is intentionally Java-focused for backend and system-design interviews:

```text
React + Quill + Yjs
        v
Native WebSocket JSON protocol
        v
Spring Boot realtime gateway
        v
Redis Pub/Sub fanout
        v
MongoDB persistence
```

## Current Tech Stack

* Frontend: React, Quill, Yjs, Yjs Awareness
* Backend: Java 21, Spring Boot, Spring Security, Spring WebSocket
* Build: Gradle wrapper
* Database: MongoDB
* Scaling layer: Redis Pub/Sub
* Auth: JWT + BCrypt password hashing
* Packaging: Docker Compose with frontend, backend, MongoDB, and Redis

## Features

* JWT registration and login
* Document ownership with owner/editor access control
* Owner-only sharing by collaborator email
* CRDT-based document collaboration using Yjs
* Native WebSocket message relay through Spring Boot
* Yjs awareness-based active collaborator roster and remote cursors
* Redis Pub/Sub fanout for multi-backend realtime propagation
* MongoDB autosave with active Yjs snapshots
* Timed version checkpoints and live restore
* Health, readiness, and metrics endpoints
* Docker Compose full-stack runtime

## Local Setup

Install:

* Java 21
* Node.js for React frontend tooling
* MongoDB, or use the repo helper scripts
* Docker Desktop if you want Redis or Docker Compose mode

No global Gradle install is required. Use `backend/gradlew.bat` on Windows or `backend/gradlew` on Unix-like shells.

Install frontend dependencies:

```bash
cd frontend
npm install
```

## Local MongoDB Workflow

From the repo root:

```bash
npm run mongo:start
npm run mongo:status
npm run mongo:stop
npm run mongo:reset
```

Notes:

* Default local MongoDB URI: `mongodb://127.0.0.1:27017/collab-editor`
* Repo-managed MongoDB data lives in `%LOCALAPPDATA%\collab-editor\mongo\data`
* Repo-managed MongoDB logs live in `%TEMP%\collab-editor-mongod.log`
* If your Windows `MongoDB` service is already running, you can skip `npm run mongo:start`

## Single-Backend Development

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

On Unix-like shells, use `./gradlew bootRun` instead of `.\gradlew.bat bootRun`.

## Redis-Scaled Development

Start Redis:

```bash
docker start collab-redis
```

If the Redis container does not exist yet:

```bash
docker run --name collab-redis -p 6379:6379 -d redis:7
```

Backend instance 1:

```bash
cd backend
.\gradlew.bat bootRun --args="--SOCKET_PORT=3001 --REDIS_ENABLED=true --REDIS_URL=redis://127.0.0.1:6379"
```

Backend instance 2:

```bash
cd backend
.\gradlew.bat bootRun --args="--SOCKET_PORT=3002 --REDIS_ENABLED=true --REDIS_URL=redis://127.0.0.1:6379"
```

Frontend instance 1:

```bash
cd frontend
npm start
```

Frontend instance 2:

```bash
cd frontend
npm run start:backend3002
```

Open `http://localhost:3000` and `http://localhost:3003`.

## Docker Compose

From the repo root:

```bash
npm run docker:up
npm run docker:logs
npm run docker:down
```

Docker Compose runs:

* React production build through Nginx
* Spring Boot backend
* MongoDB
* Redis

The frontend proxies `/api/` and `/ws` to the Java backend.

## Backend Runtime Endpoints

* `GET /healthz`: liveness
* `GET /readyz`: MongoDB readiness
* `GET /metrics`: Prometheus-style operational metrics
* `GET /api/auth/me`: authenticated current-user check
* `GET /api/documents`: list accessible documents
* `POST /api/documents`: create document
* `GET /api/documents/{documentId}`: document metadata
* `POST /api/documents/{documentId}/share`: owner-only sharing

## WebSocket Protocol

The frontend connects to:

```text
ws://localhost:3001/ws?token=<jwt>
```

Messages are JSON envelopes:

```json
{
  "event": "yjs-update",
  "payload": {
    "update": {
      "__binaryBase64": "..."
    }
  }
}
```

Main events:

* `get-document`
* `load-document`
* `join-document`
* `yjs-update`
* `request-document-sync`
* `document-sync`
* `awareness-update`
* `request-awareness-sync`
* `awareness-sync`
* `awareness-remove`
* `awareness-leave`
* `get-document-history`
* `document-history`
* `document-history-updated`
* `restore-version`
* `document-restored`
* `save-document`

## Testing

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

Browser smoke tests:

```bash
npm run e2e:single
npm run e2e:redis
npm run e2e:docker
```

## Interview One-Liner

> I built a CRDT-based collaborative editor with React, Yjs, Java Spring Boot WebSockets, Redis Pub/Sub, MongoDB, JWT authentication, document-level access control, version history, live restore, and Docker packaging.

## Documentation

* Architecture: `docs/ARCHITECTURE.md`
* Java learning story: `docs/Design Flow.md`
* Local runbook: `docs/LOCAL_DEV_SETUP.md`
* Interview guide: `docs/SYSTEM_DESIGN_INTERVIEW_GUIDE.md`
* Learning path: `docs/LEARNING_PATH.md`
