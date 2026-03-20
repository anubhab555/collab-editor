# CRDT and Yjs 101

This document explains the next major upgrade for the project.

## 1. Why is another collaboration upgrade needed?

The current project already syncs edits in real time.

That is good, but it still has a limitation:

- it is delta-based synchronization
- it is not yet a full conflict-free shared data model

As concurrency grows, you want a system that is much better at merging edits safely and predictably.

That is where CRDTs and Yjs come in.

## 2. What is a CRDT?

CRDT stands for Conflict-Free Replicated Data Type.

The simple idea is:

- multiple users can update their local copy
- updates can arrive in different orders
- the system still converges to the same final state

That is powerful for collaborative editing.

## 3. How is that different from the current system?

Current system:

- Quill creates deltas
- clients send deltas
- other clients apply deltas
- cursors are adjusted with transform logic

Planned CRDT system:

- each client keeps a shared CRDT document
- updates are merged by the CRDT model itself
- the final state converges automatically

So the difference is:

- current system: real-time event sync
- CRDT system: shared conflict-resilient data model

## 4. What is Yjs?

Yjs is a popular CRDT library for collaborative applications.

It is commonly used for:

- collaborative text editors
- whiteboards
- shared data structures
- awareness features like presence or cursors

Why Yjs is a strong choice:

- mature ecosystem
- good performance
- widely recognized in collaborative app development

## 5. What would Yjs add to this project?

Yjs would improve:

- conflict handling
- collaboration correctness
- offline-friendly behavior
- eventual convergence of shared state

It also gives a stronger architecture story in interviews.

## 6. What is awareness in Yjs?

Yjs separates the shared document from temporary user state.

Examples of temporary user state:

- username
- cursor position
- selection
- presence status

This temporary state is often called awareness.

That is useful because:

- document content should be persisted
- cursor positions should be live but not stored as document content

## 7. How would migration likely look in this project?

High level:

1. Replace the current delta broadcast model for text content
2. Introduce a Yjs shared document
3. Sync Yjs updates over a WebSocket provider
4. Keep presence and cursor state aligned with Yjs awareness
5. Decide how snapshots or persistence will work with Yjs

The current cursor work is still useful because:

- it teaches real-time lifecycle handling
- it teaches remote presence concepts
- it prepares you to think about awareness and rendering

## 8. OT vs CRDT in simple words

You may hear both OT and CRDT in collaborative editing discussions.

Very simple comparison:

- OT transforms operations relative to each other
- CRDTs design the data model so replicas converge automatically

For interviews, you do not need a textbook explanation.

You just need to say:

> Our current version is not yet a CRDT engine. The next upgrade is Yjs, which gives us a proper CRDT-based shared document model.

That is enough unless the interviewer goes much deeper.

## 9. Why Yjs is a good resume upgrade

It moves the project from:

- real-time collaboration demo

toward:

- advanced collaborative systems engineering

That matters because it shows you understand that sending events is not the same as solving distributed state convergence.

## 10. Interview-ready explanation

You can say:

> The current editor uses delta-based real-time synchronization. The next planned upgrade is Yjs so the collaboration model becomes CRDT-based instead of just event-based. That would improve correctness under concurrent edits and give the editor a more production-grade shared-state foundation.

## 11. What to read next

If you want deployment context after this, read:

- [Docker and Kubernetes 101](./DOCKER_KUBERNETES_101.md)
