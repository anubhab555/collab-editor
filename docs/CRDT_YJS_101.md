# CRDT and Yjs 101

This document explains the CRDT layer that is now implemented in the project.

## 1. What is implemented today?

Today, document content sync is powered by Yjs.

That means:

- Quill is still the editor UI
- Yjs is the shared document model
- Socket.io is still the transport layer
- Redis is still the scaling layer for multi-instance delivery
- MongoDB stores a persisted Yjs snapshot plus a Quill delta mirror
- timed version checkpoints now sit on top of that persisted state

Important limitation:

- cursor and presence state are still handled by the custom socket-based cursor system
- this phase did not move presence to Yjs awareness yet

## 2. What is a CRDT?

CRDT stands for Conflict-Free Replicated Data Type.

The simple idea is:

- multiple users can update their local copy
- updates can arrive in different orders
- the system still converges to the same final state

That is powerful for collaborative editing.

## 3. How is that different from the older delta-sync version?

Earlier version:

- Quill created deltas
- clients sent those deltas directly
- other clients applied those deltas directly

Current version:

- each client keeps a local Yjs document
- Quill is bound to that shared Yjs text
- clients exchange Yjs updates instead of raw editor deltas
- the document converges through the CRDT model itself

So the difference is:

- older version: event-based delta sync
- current version: CRDT-based shared document sync

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

## 5. What Yjs adds to this project

Yjs improves:

- conflict handling
- collaboration correctness
- offline-friendly behavior
- eventual convergence of shared state

It also gives a stronger architecture story in interviews because sending realtime events is no longer the whole collaboration model.

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

## 7. How this project uses Yjs right now

High level:

1. The backend loads a persisted Yjs baseline, or converts a legacy Quill delta document into Yjs.
2. The frontend creates one `Y.Doc` per open document.
3. `QuillBinding` binds Quill to `ydoc.getText("quill")`.
4. Local Yjs updates are sent over Socket.io with `yjs-update`.
5. Remote clients apply those updates into their own Yjs document.
6. New clients can request a live peer catch-up after the persisted baseline loads.
7. MongoDB keeps timed checkpoints so older states can be restored live for the whole room.

The current cursor work is still relevant because:

- it handles realtime lifecycle cleanup already
- it keeps presence separate from persisted document content
- it is a reasonable bridge until Yjs awareness is introduced

## 8. OT vs CRDT in simple words

You may hear both OT and CRDT in collaborative editing discussions.

Very simple comparison:

- OT transforms operations relative to each other
- CRDTs design the data model so replicas converge automatically

You can now say:

> The current editor uses Yjs for CRDT-based content sync, but cursor and presence handling are still on a custom realtime layer rather than Yjs awareness.

That is a strong and honest answer.

## 9. Why Yjs is a strong resume upgrade

It moves the project from:

- event-driven collaboration demo

toward:

- real shared-state collaboration engineering

That matters because it shows you understand that sending events is not the same as solving distributed state convergence.

## 10. Interview-ready explanation

You can say:

> The current editor uses Yjs for CRDT-based content sync over our existing Socket.io transport. That means content convergence is handled by the shared data model, while cursor presence is still managed separately through custom socket events. Redis still scales the transport layer across backend instances.

## 11. What is still left after this phase

The next meaningful upgrades are:

- Yjs awareness for presence and cursors
- Dockerized deployment

## 12. What to read next

If you want system-design context after this, read:

- [System Design Interview Guide](./SYSTEM_DESIGN_INTERVIEW_GUIDE.md)
