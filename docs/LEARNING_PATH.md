# Learning Path

This file is the best place to start if you want to understand the project from basics to interview level.

The idea is simple:

- first understand what the app does
- then understand how real-time collaboration works
- then understand how scaling works
- then understand what the next upgrades mean

## Recommended Reading Order

### 1. Start with the current project shape

Read:

- [Local Dev Setup](./LOCAL_DEV_SETUP.md)
- [Architecture](./ARCHITECTURE.md)
- [System Design Interview Guide](./SYSTEM_DESIGN_INTERVIEW_GUIDE.md)
- [Design Flow](./Design%20Flow.md)

After this, you should be able to answer:

- How do I start the project locally without MongoDB confusion?
- What does the app do today?
- Which parts are already implemented?
- Which parts are still planned?
- Which design patterns are used here?
- How should I talk about this project in HLD and LLD interviews?

### 2. Learn the real-time basics

Read:

- [Realtime Collaboration 101](./REALTIME_COLLABORATION_101.md)

After this, you should be able to answer:

- What is a WebSocket?
- Why use Socket.io?
- What is a room?
- What is a Quill Delta?
- Why do remote cursors drift?

### 3. Learn the scaling layer

Read:

- [Redis Scaling 101](./REDIS_SCALING_101.md)

After this, you should be able to answer:

- Why does a single WebSocket server not scale horizontally by itself?
- What does Redis pub/sub do here?
- Why do sticky sessions matter?
- Why are retry, logging, and graceful shutdown useful?

### 4. Learn the current CRDT layer

Read:

- [CRDT and Yjs 101](./CRDT_YJS_101.md)

After this, you should be able to answer:

- How is Yjs used in the current system?
- What problem does Yjs solve?
- What is still left after CRDT content sync?

### 5. Learn deployment concepts

Read:

- [Docker and Kubernetes 101](./DOCKER_KUBERNETES_101.md)

After this, you should be able to answer:

- What Docker would add to this project
- What Kubernetes would add after Docker
- How this architecture would map to containers and deployments

## Fast Interview Revision Plan

If you only have 20 to 30 minutes before an interview, read in this order:

1. [Design Flow](./Design%20Flow.md)
2. [Architecture](./ARCHITECTURE.md)
3. [System Design Interview Guide](./SYSTEM_DESIGN_INTERVIEW_GUIDE.md)
4. [Redis Scaling 101](./REDIS_SCALING_101.md)
5. [CRDT and Yjs 101](./CRDT_YJS_101.md)

## What You Can Honestly Claim Today

Today you can confidently say:

- You built a real-time collaborative editor with React, Quill, Socket.io, and MongoDB
- You added awareness-based presence and remote cursor tracking with drift correction
- You modularized the backend
- You added Redis-based Socket.io scaling support for multi-instance real-time delivery
- You migrated document content sync to Yjs-based CRDT updates
- You added timed version history with live restore
- You added an automated test harness for core backend and frontend collaboration flows
- You added JWT authentication and document-level owner/editor access control
- You Dockerized the full stack with frontend, backend, MongoDB, and Redis

Today you should not claim yet:

- Kubernetes deployment
- enterprise-grade auth features such as OAuth, password reset, refresh-token rotation, team invites, or audit logs

Those are still future upgrades.

## How To Use These Docs

Do not try to memorize every sentence.

Instead, focus on these three layers:

1. Problem
2. Solution
3. Tradeoff

Example:

- Problem: multiple backend instances cannot share socket events by default
- Solution: use the Socket.io Redis adapter
- Tradeoff: Redis adds another moving part and operational complexity

If you can explain those three things clearly, you will sound much stronger in interviews.
