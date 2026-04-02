# Realtime Collaboration 101

This document teaches the core ideas behind the current project in simple language.

## 1. What problem are we solving?

A collaborative editor lets multiple people work on the same document at the same time.

That sounds simple, but there are several moving parts:

- everyone must see edits quickly
- everyone must stay in sync
- cursors should feel live
- data should still be saved if the page reloads

This project solves that with:

- React for the UI
- Quill for the editor
- Socket.io for real-time events
- Yjs for shared content sync
- MongoDB for persistence

## 2. What is a WebSocket?

A WebSocket is a long-lived connection between browser and server.

Normal HTTP is request-response:

- browser sends a request
- server sends a response
- connection is done

A WebSocket stays open:

- browser and server can both send messages at any time
- this is useful for chat, live dashboards, multiplayer apps, and collaborative editors

## 3. Why use Socket.io instead of raw WebSocket?

Socket.io is a library built on top of the WebSocket idea.

It gives helpful features like:

- named events such as `yjs-update` or `awareness-update`
- rooms, so one document's users do not receive another document's events
- reconnect behavior
- a simpler developer experience

So the project is still a real-time WebSocket-style system, but Socket.io makes it much easier to build.

## 4. What is a room?

A room is just a group of sockets.

In this project:

- each `documentId` becomes a room
- users editing the same document join the same room
- broadcasts go only to that room

That means:

- document A users do not receive document B events
- the server can scope edit and awareness events correctly

## 5. What is a Quill Delta?

Quill does not just think in terms of "the full document string."
It can express edits as operations.

Example:

```js
retain 5, insert "hello"
```

That means:

- keep the first 5 characters
- then insert `"hello"`

This is useful because:

- payloads are smaller than sending the whole document every time
- the app can apply only the change, not rewrite everything

## 6. Is the current app already OT or CRDT?

Partly yes.

This is the honest interview answer:

- document content is now CRDT-based through Yjs
- Socket.io is still the transport layer
- presence state is now carried by Yjs awareness over that transport
- cursor positions still use transform logic in the renderer because visual cursor placement is still a local UI problem

So the current system is more unified than before:

- Yjs for content correctness
- Yjs awareness for ephemeral collaborator state
- Socket.io room events for transport and scaling
- a custom cursor renderer for efficient DOM updates

## 7. Why do cursors drift?

Suppose:

- User B's cursor is at index 10
- User A inserts text before index 10

Now index 10 is no longer the same place in the document.

So if you keep User B's cursor at the old index, it looks wrong.

This is called cursor drift.

The project reduces that by transforming cursor positions using Quill Delta `transformPosition(...)`.

## 8. Why is cursor rendering handled outside React?

React is great for UI, but remote cursor movement can happen very frequently.

If every cursor update caused a React re-render, that could become expensive.

So the project uses a custom `CursorManager` class that:

- stores remote cursor state
- manipulates DOM nodes directly
- batches updates with `requestAnimationFrame`

That is a good engineering choice for this kind of highly dynamic overlay.

## 9. Why do we still autosave if events are real-time?

Real-time sync and persistence are different problems.

Real-time sync means:

- other users see your changes immediately

Persistence means:

- the document still exists after refresh or reconnect

That is why the app also sends `save-document` every 2 seconds and stores a Yjs snapshot plus a Quill delta mirror in MongoDB.

## 10. Where these concepts live in this project

- Socket setup: `frontend/src/TextEditor.js`
- Cursor engine: `frontend/src/CursorManager.js`
- Server room logic: `backend/websocket/socketHandler.js`
- MongoDB persistence: `backend/services/documentService.js`

## 11. Interview-ready explanation

You can say:

> I built the editor on top of React, Quill, Socket.io, and Yjs. Quill provides the editing UI, Yjs provides CRDT-based content convergence, Yjs awareness carries ephemeral collaborator state like names and cursors, Socket.io handles room-based realtime transport, and a dedicated cursor renderer keeps remote carets visually aligned with delta-aware position updates.

## 12. What to learn next

After this document, read:

- [Redis Scaling 101](./REDIS_SCALING_101.md)
- [CRDT and Yjs 101](./CRDT_YJS_101.md)
