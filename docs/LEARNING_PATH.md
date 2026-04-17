# Learning Path

Use this order to study the project for Java backend interviews.

## 1. Run The Project

Read:

* [Local Dev Setup](./LOCAL_DEV_SETUP.md)

Goal:

* start MongoDB
* start Spring Boot
* start React
* test one collaborative document

## 2. Understand The Architecture

Read:

* [Architecture](./ARCHITECTURE.md)
* [Design Flow](./Design%20Flow.md)

Goal:

* explain why the backend is Java
* explain how React, Yjs, Spring Boot, Redis, and MongoDB fit together
* explain what Java owns versus what Yjs owns

## 3. Learn Realtime Collaboration

Read:

* [Realtime Collaboration 101](./REALTIME_COLLABORATION_101.md)

Focus on:

* WebSocket basics
* document rooms
* event-driven updates
* cursor and presence lifecycle

## 4. Learn Redis Pub/Sub

Read:

* [Redis Scaling 101](./REDIS_SCALING_101.md)

Focus on:

* why WebSocket servers need fanout
* how Pub/Sub helps multiple backend instances
* what Redis does and does not persist

## 5. Learn Yjs And CRDTs

Read:

* [CRDT and Yjs 101](./CRDT_YJS_101.md)

Focus on:

* Yjs runs in the browser
* Java treats Yjs updates as opaque payloads
* CRDT convergence is separate from backend routing

## 6. Prepare For Interviews

Read:

* [System Design Interview Guide](./SYSTEM_DESIGN_INTERVIEW_GUIDE.md)

Practice explaining:

* HLD diagram
* edit flow
* auth flow
* Redis scaling flow
* version restore flow
* Java package responsibilities

## Fast Revision Plan

If you have 30 minutes before an interview:

1. [Design Flow](./Design%20Flow.md)
2. [Architecture](./ARCHITECTURE.md)
3. [System Design Interview Guide](./SYSTEM_DESIGN_INTERVIEW_GUIDE.md)
4. [Redis Scaling 101](./REDIS_SCALING_101.md)
5. [CRDT and Yjs 101](./CRDT_YJS_101.md)

## What You Can Honestly Claim

* React frontend
* Java Spring Boot backend
* Gradle build
* JWT auth
* Spring Security
* Spring WebSocket realtime gateway
* MongoDB persistence
* Redis Pub/Sub fanout
* Yjs CRDT collaboration
* Yjs awareness presence and cursors
* version history and live restore
* Docker Compose packaging

## What Not To Claim

* Kubernetes is implemented
* OAuth is implemented
* password reset is implemented
* Java computes CRDT merges internally
* distributed tracing is implemented
