# Redis Scaling 101

This document explains why Redis was added, what problem it solves, and how it fits into this project.

## 1. What problem does Redis solve here?

A single Socket.io server is easy:

- all connected users are in one Node.js process
- that process knows every socket
- room broadcasts work locally

But production systems often run multiple backend instances.

Example:

- backend instance A
- backend instance B

Now the problem appears:

- users connected to A are only known to A
- users connected to B are only known to B
- without a shared message layer, A cannot directly broadcast to B's sockets

That is why horizontal scaling breaks real-time apps if you do nothing extra.

## 2. What is Redis pub/sub in simple words?

Redis pub/sub means:

- one process can publish a message
- other processes can subscribe and receive that message

For this project, think of Redis as a message bridge between backend instances.

So instead of only this:

- browser -> backend A

we now effectively get:

- browser -> backend A
- backend A -> Redis
- Redis -> backend B
- backend B -> its connected sockets

## 3. What does the Socket.io Redis adapter do?

The adapter lets Socket.io use Redis under the hood.

That means the same room-based code can keep working, but broadcasts are no longer limited to one process.

This is the key benefit:

- application code stays mostly the same
- infrastructure becomes multi-instance aware

## 4. How this project uses Redis

The Redis integration lives in:

- `backend/config/redisAdapter.js`
- `backend/server.js`

The flow is:

1. Read `REDIS_URL`
2. If it is missing, stay in single-node mode
3. If it is present, create Redis pub/sub clients
4. Connect both clients
5. Install the Socket.io Redis adapter
6. Start the server

## 5. Why keep single-node mode?

Because local development should still be easy.

If every local run required Redis, the project would be harder to work on.

So the current design is:

- no `REDIS_URL` -> normal single-node behavior
- `REDIS_URL` set -> Redis mode becomes active

This is a practical developer-friendly choice.

## 6. Why not silently fall back if Redis fails?

Because that can hide real production problems.

Imagine:

- you think your app is horizontally scalable
- Redis is actually down
- the app quietly falls back to single-node mode

Now cross-instance collaboration breaks, but the logs might not make it obvious.

That is why the project does this:

- if `REDIS_URL` is set, Redis is expected
- if Redis cannot connect, startup should fail

That is safer and more honest operational behavior.

## 7. Why add reconnect backoff?

Sometimes Redis might be temporarily slow to start.

If the client retries too aggressively:

- logs become noisy
- startup looks flaky
- the system can hammer Redis unnecessarily

This project uses:

```js
Math.min(retries * 50, 2000)
```

That means:

- retry delay grows gradually
- it never becomes unreasonably large

This is called bounded backoff.

## 8. Why graceful shutdown matters

When the Node.js process stops, Redis connections should close cleanly.

That is why the backend handles signals like:

- `SIGINT`
- `SIGTERM`

and calls `quit()` on the Redis clients.

This is a small detail, but it shows production awareness.

## 9. Why logging matters

Good logs make systems easier to operate and debug.

The project now logs:

- `[Redis] Running in single-node mode`
- `[Redis] Connected to pub/sub`
- `[Redis] Adapter enabled`

These messages answer three useful questions quickly:

- Is Redis being used at all?
- Did the clients connect?
- Is the Socket.io adapter actually active?

## 10. What are sticky sessions and why do they matter?

A load balancer sits in front of multiple backend instances.

With long-lived WebSocket connections, the load balancer must route traffic correctly.

Sticky sessions usually mean:

- a client stays bound to the same backend instance after connecting

Why this matters:

- WebSockets are long-lived
- random rebalance during a live session can break assumptions

In production, you usually want either:

- sticky sessions
- or a load balancer / proxy that is explicitly designed for WebSocket traffic

Redis solves cross-instance event propagation, but it does not replace proper connection routing.

## 11. How to describe this in an interview

You can say:

> Initially the collaboration system only worked correctly inside one Node.js process. I added the Socket.io Redis adapter so room broadcasts for Yjs content updates and cursor updates propagate across multiple backend instances. I also kept local development simple with env-gated single-node mode and added reconnect backoff, logging, and graceful shutdown for safer operations.

## 12. What this does not solve yet

Redis scaling improves event delivery across instances.

It does not automatically solve:

- Yjs awareness-based presence
- version history
- containerized deployment
- Kubernetes orchestration

Those are separate concerns.

## 13. What to read next

Next read:

- [CRDT and Yjs 101](./CRDT_YJS_101.md)
- [Docker and Kubernetes 101](./DOCKER_KUBERNETES_101.md)
