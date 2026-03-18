# Collab Editor

## Setup
1. `npm install` (at root)

## Development
* Run Backend: `cd backend && npm run dev`
* Run Frontend: `cd frontend && npm start`

## Features
* Real-time collaborative editing with Quill deltas over Socket.io
* Live remote cursor tracking with browser-persisted collaborator names
* Delta-aware cursor drift correction while users type concurrently
* MongoDB-backed document persistence with periodic autosave

## Cursor Tracking Events
* `join-document`: register collaborator metadata for the active document room
* `cursor-move`: send throttled caret updates for the current collaborator
* `cursor-update`: receive remote collaborator cursor positions
* `cursor-remove`: remove remote cursors when collaborators blur, switch documents, or disconnect
