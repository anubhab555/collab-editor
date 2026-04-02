import { useCallback, useEffect, useRef, useState } from "react"
import Quill from "quill"
import "quill/dist/quill.snow.css"
import { io } from "socket.io-client"
import { useParams } from "react-router-dom"
import { v4 as uuidV4 } from "uuid"
import * as Y from "yjs"
import { QuillBinding } from "y-quill"

import CursorManager from "./CursorManager"


const SAVE_INTERVAL_MS = 2000
const CURSOR_EMIT_INTERVAL_MS = 75
const SOCKET_SERVER_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:3001"
const TOOLBAR_OPTIONS = [
    [{ header: [1, 2, 3, 4, 5, 6, false] }],
    [{ font: [] }],
    [{ list: "ordered" }, { list: "bullet" }],
    ["bold", "italic", "underline"],
    [{ color: [] }, { background: [] }],
    [{ script: "sub" }, { script: "super" }],
    [{ align: [] }],
    ["blockquote", "image", "code-block"],
    ["clean"],
]

const Delta = Quill.import("delta")
const CURSOR_COLORS = [
    "#d9480f",
    "#2b8a3e",
    "#1864ab",
    "#a61e4d",
    "#5f3dc4",
    "#0b7285",
    "#e67700",
    "#c2255c",
]
const VERSION_SOURCE_LABELS = {
    checkpoint: "Checkpoint",
    "restore-backup": "Pre-restore backup",
}
const HISTORY_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
})
const CLIENT_ID_STORAGE_KEY = "collab-editor-client-id"
const DISPLAY_NAME_STORAGE_KEY = "collab-editor-display-name"
const YJS_INITIAL_ORIGIN = Symbol("yjs-initial-origin")
const YJS_REMOTE_ORIGIN = Symbol("yjs-remote-origin")
const YJS_PEER_SYNC_ORIGIN = Symbol("yjs-peer-sync-origin")

let collaboratorCache

function getStableHash(value) {
    let hash = 0

    for (let index = 0; index < value.length; index += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(index)
        hash |= 0
    }

    return Math.abs(hash)
}

function getDisplayName() {
    const storedDisplayName = window.localStorage.getItem(DISPLAY_NAME_STORAGE_KEY)?.trim()
    if (storedDisplayName) return storedDisplayName

    const promptedName = window.prompt("Enter your display name for collaborative editing:")?.trim()
    const displayName = promptedName || `Guest-${uuidV4().slice(0, 4)}`

    window.localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, displayName)
    return displayName
}

function getOrCreateCollaborator() {
    if (collaboratorCache) return collaboratorCache

    const storedClientId = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY)
    const clientId = storedClientId || uuidV4()

    if (!storedClientId) {
        window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId)
    }

    const displayName = getDisplayName()
    const color = CURSOR_COLORS[getStableHash(clientId) % CURSOR_COLORS.length]

    collaboratorCache = {
        clientId,
        displayName,
        color,
    }

    return collaboratorCache
}

function normalizeRange(range) {
    if (!range) return null

    return {
        index: range.index,
        length: range.length,
    }
}

function normalizeBinaryUpdate(update) {
    if (!update) return null

    if (update instanceof Uint8Array) {
        return update
    }

    if (ArrayBuffer.isView(update)) {
        return new Uint8Array(update.buffer, update.byteOffset, update.byteLength)
    }

    if (update instanceof ArrayBuffer) {
        return new Uint8Array(update)
    }

    if (Array.isArray(update)) {
        return Uint8Array.from(update)
    }

    if (update.type === "Buffer" && Array.isArray(update.data)) {
        return Uint8Array.from(update.data)
    }

    return null
}

function uint8ArrayToBase64(bytes) {
    if (!bytes || bytes.byteLength === 0) return ""

    let binary = ""
    const chunkSize = 0x8000

    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize)
        binary += String.fromCharCode(...chunk)
    }

    return window.btoa(binary)
}

function base64ToUint8Array(base64) {
    if (!base64) return new Uint8Array(0)

    const binary = window.atob(base64)
    const bytes = new Uint8Array(binary.length)

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
    }

    return bytes
}

function createYjsSession(documentId) {
    const ydoc = new Y.Doc()

    return {
        documentId,
        ydoc,
        yText: ydoc.getText("quill"),
        binding: null,
        handleDocUpdate: null,
    }
}

function destroyYjsSession(session) {
    if (!session) return

    if (session.binding) {
        session.binding.destroy()
        session.binding = null
    }

    if (session.handleDocUpdate) {
        session.ydoc.off("update", session.handleDocUpdate)
    }

    session.ydoc.destroy()
}

function formatHistoryTimestamp(createdAt) {
    if (!createdAt) return "Unknown time"

    const date = new Date(createdAt)
    if (Number.isNaN(date.getTime())) return "Unknown time"

    return HISTORY_TIMESTAMP_FORMATTER.format(date)
}

export default function TextEditor() {
    const { id: documentId } = useParams()
    const [quill, setQuill] = useState()
    const [socket, setSocket] = useState()
    const [collaborator] = useState(() => getOrCreateCollaborator())
    const [versions, setVersions] = useState([])
    const [historyLoading, setHistoryLoading] = useState(true)
    const [restoringVersionId, setRestoringVersionId] = useState(null)
    const cursorManagerRef = useRef(null)
    const yjsSessionRef = useRef(null)
    const documentReadyRef = useRef(false)
    const cursorThrottleRef = useRef({
        lastSentAt: 0,
        timeoutId: null,
        pendingRange: null,
    })

    const emitCursorMove = useCallback((range, options = {}) => {
        const { force = false } = options
        if (socket == null || (!documentReadyRef.current && !force)) return

        const throttleState = cursorThrottleRef.current
        const normalizedRange = normalizeRange(range)

        const emitNow = (nextRange) => {
            throttleState.lastSentAt = Date.now()
            throttleState.pendingRange = null
            socket.emit("cursor-move", { range: nextRange })
        }

        if (force) {
            if (throttleState.timeoutId != null) {
                window.clearTimeout(throttleState.timeoutId)
                throttleState.timeoutId = null
            }

            emitNow(normalizedRange)
            return
        }

        const now = Date.now()
        const elapsed = now - throttleState.lastSentAt

        if (elapsed >= CURSOR_EMIT_INTERVAL_MS) {
            emitNow(normalizedRange)
            return
        }

        throttleState.pendingRange = normalizedRange

        if (throttleState.timeoutId != null) return

        throttleState.timeoutId = window.setTimeout(() => {
            throttleState.timeoutId = null
            emitNow(throttleState.pendingRange)
        }, CURSOR_EMIT_INTERVAL_MS - elapsed)
    }, [socket])

    const mountSessionFromSnapshot = useCallback((yjsStateBase64, origin = YJS_INITIAL_ORIGIN) => {
        if (socket == null || quill == null) return null

        documentReadyRef.current = false

        const currentSession = yjsSessionRef.current
        if (currentSession) {
            destroyYjsSession(currentSession)
        }

        const session = createYjsSession(documentId)
        yjsSessionRef.current = session

        session.handleDocUpdate = (update, updateOrigin) => {
            if (yjsSessionRef.current !== session) return
            if (!documentReadyRef.current || updateOrigin !== session.binding) return

            socket.emit("yjs-update", { update })
        }

        session.ydoc.on("update", session.handleDocUpdate)

        const baselineUpdate = base64ToUint8Array(yjsStateBase64)
        if (baselineUpdate.byteLength > 0) {
            Y.applyUpdate(session.ydoc, baselineUpdate, origin)
        }

        session.binding = new QuillBinding(session.yText, quill)
        quill.enable()
        documentReadyRef.current = true
        cursorManagerRef.current?.scheduleRender()

        return session
    }, [documentId, quill, socket])

    const handleRestoreRequest = useCallback((versionId) => {
        if (socket == null || !documentReadyRef.current) return

        const confirmed = window.confirm(
            "Restore this version for everyone currently editing the document?"
        )

        if (!confirmed) return

        setRestoringVersionId(versionId)
        socket.emit("restore-version", {
            documentId,
            versionId,
        })
    }, [socket, documentId])

    useEffect(() => {
        const s = io(SOCKET_SERVER_URL)
        setSocket(s)

        return () => {
            s.disconnect()
        }
    }, [])

    useEffect(() => {
        if (quill == null) return

        const cursorManager = new CursorManager(quill)
        cursorManagerRef.current = cursorManager

        return () => {
            cursorManagerRef.current = null
            cursorManager.destroy()
        }
    }, [quill])

    useEffect(() => {
        if (socket == null || quill == null) return

        documentReadyRef.current = false
        setVersions([])
        setHistoryLoading(true)
        setRestoringVersionId(null)
        cursorManagerRef.current?.clearAll()
        quill.disable()
        quill.setText("Loading...")

        const handleLoadDocument = ({ yjsStateBase64 } = {}) => {
            mountSessionFromSnapshot(yjsStateBase64)

            socket.emit("join-document", {
                documentId,
                user: collaborator,
            })
            socket.emit("get-document-history", { documentId })
        }

        socket.once("load-document", handleLoadDocument)
        socket.emit("get-document", documentId)

        return () => {
            emitCursorMove(null, { force: true })
            documentReadyRef.current = false
            setVersions([])
            setHistoryLoading(true)
            setRestoringVersionId(null)
            cursorManagerRef.current?.clearAll()
            socket.off("load-document", handleLoadDocument)
            quill.disable()

            const currentSession = yjsSessionRef.current
            destroyYjsSession(currentSession)
            yjsSessionRef.current = null
        }
    }, [socket, quill, documentId, collaborator, emitCursorMove, mountSessionFromSnapshot])

    useEffect(() => {
        if (socket == null || quill == null) return

        const interval = setInterval(() => {
            const session = yjsSessionRef.current
            if (!documentReadyRef.current || !session || session.documentId !== documentId) return

            socket.emit("save-document", {
                yjsStateBase64: uint8ArrayToBase64(Y.encodeStateAsUpdate(session.ydoc)),
                data: quill.getContents(),
            })
        }, SAVE_INTERVAL_MS)

        return () => {
            clearInterval(interval)
        }
    }, [socket, quill, documentId])

    useEffect(() => {
        if (socket == null || quill == null) return

        const handleYjsUpdate = ({ documentId: updateDocumentId, update } = {}) => {
            const session = yjsSessionRef.current
            if (!session || session.documentId !== updateDocumentId) return

            const normalizedUpdate = normalizeBinaryUpdate(update)
            if (!normalizedUpdate) return

            Y.applyUpdate(session.ydoc, normalizedUpdate, YJS_REMOTE_ORIGIN)
            cursorManagerRef.current?.scheduleRender()
        }

        const handleRequestDocumentSync = ({ documentId: syncDocumentId, requestId, targetSocketId } = {}) => {
            const session = yjsSessionRef.current
            if (!session || session.documentId !== syncDocumentId) return
            if (!requestId || !targetSocketId || targetSocketId === socket.id) return

            socket.emit("document-sync", {
                documentId: syncDocumentId,
                requestId,
                targetSocketId,
                update: Y.encodeStateAsUpdate(session.ydoc),
            })
        }

        const handleDocumentSync = ({ documentId: syncDocumentId, update } = {}) => {
            const session = yjsSessionRef.current
            if (!session || session.documentId !== syncDocumentId) return

            const normalizedUpdate = normalizeBinaryUpdate(update)
            if (!normalizedUpdate) return

            Y.applyUpdate(session.ydoc, normalizedUpdate, YJS_PEER_SYNC_ORIGIN)
            cursorManagerRef.current?.scheduleRender()
        }

        const handleDocumentHistory = ({ documentId: historyDocumentId, versions: nextVersions = [] } = {}) => {
            if (historyDocumentId !== documentId) return

            setVersions(nextVersions)
            setHistoryLoading(false)
        }

        const handleDocumentHistoryUpdated = ({ documentId: historyDocumentId, versions: nextVersions = [] } = {}) => {
            if (historyDocumentId !== documentId) return

            setVersions(nextVersions)
            setHistoryLoading(false)
        }

        const handleDocumentRestored = ({ documentId: restoredDocumentId, yjsStateBase64 } = {}) => {
            if (restoredDocumentId !== documentId) return

            emitCursorMove(null, { force: true })
            cursorManagerRef.current?.clearAll()
            quill.disable()
            quill.setText("Restoring...")
            mountSessionFromSnapshot(yjsStateBase64, YJS_INITIAL_ORIGIN)
            setRestoringVersionId(null)
            socket.emit("get-document-history", { documentId: restoredDocumentId })
        }

        const handleCursorUpdate = ({ user, range }) => {
            if (!user?.clientId || user.clientId === collaborator.clientId) return

            cursorManagerRef.current?.upsertCursor(user, range)
        }

        const handleCursorRemove = ({ clientId }) => {
            if (!clientId || clientId === collaborator.clientId) return

            cursorManagerRef.current?.removeCursor(clientId)
        }

        socket.on("yjs-update", handleYjsUpdate)
        socket.on("request-document-sync", handleRequestDocumentSync)
        socket.on("document-sync", handleDocumentSync)
        socket.on("document-history", handleDocumentHistory)
        socket.on("document-history-updated", handleDocumentHistoryUpdated)
        socket.on("document-restored", handleDocumentRestored)
        socket.on("cursor-update", handleCursorUpdate)
        socket.on("cursor-remove", handleCursorRemove)

        return () => {
            socket.off("yjs-update", handleYjsUpdate)
            socket.off("request-document-sync", handleRequestDocumentSync)
            socket.off("document-sync", handleDocumentSync)
            socket.off("document-history", handleDocumentHistory)
            socket.off("document-history-updated", handleDocumentHistoryUpdated)
            socket.off("document-restored", handleDocumentRestored)
            socket.off("cursor-update", handleCursorUpdate)
            socket.off("cursor-remove", handleCursorRemove)
        }
    }, [socket, quill, documentId, collaborator.clientId, emitCursorMove, mountSessionFromSnapshot])

    useEffect(() => {
        if (socket == null || quill == null) return

        const handleTextChange = (rawDelta, oldDelta, source) => {
            const delta = new Delta(rawDelta)

            cursorManagerRef.current?.transformCursors(delta)
            cursorManagerRef.current?.scheduleRender()

            if (source !== "user") return

            emitCursorMove(quill.getSelection())
        }

        const handleSelectionChange = (range, oldRange, source) => {
            if (source === "silent") return

            emitCursorMove(range, { force: range == null })
        }

        const handleBlur = () => {
            emitCursorMove(null, { force: true })
        }

        quill.on("text-change", handleTextChange)
        quill.on("selection-change", handleSelectionChange)
        quill.root.addEventListener("blur", handleBlur)

        return () => {
            quill.off("text-change", handleTextChange)
            quill.off("selection-change", handleSelectionChange)
            quill.root.removeEventListener("blur", handleBlur)
        }
    }, [socket, quill, emitCursorMove])

    useEffect(() => {
        const throttleState = cursorThrottleRef.current

        return () => {
            if (throttleState.timeoutId != null) {
                window.clearTimeout(throttleState.timeoutId)
                throttleState.timeoutId = null
            }
        }
    }, [])

    const wrapperRef = useCallback((wrapper) => {
        if (wrapper == null) return

        wrapper.innerHTML = ""
        const editor = document.createElement("div")
        wrapper.append(editor)
        const q = new Quill(editor, { theme: "snow", modules: { toolbar: TOOLBAR_OPTIONS } })
        q.disable()
        q.setText("Loading...")
        setQuill(q)
    }, [])

    return (
        <div className="editor-shell">
            <div className="editor-main">
                <div className="container" ref={wrapperRef}></div>
            </div>
            <aside className="history-panel">
                <div className="history-panel__header">
                    <h2>Version History</h2>
                    <p>Automatic checkpoints are created every 30 seconds while the document changes.</p>
                </div>
                <div className="history-panel__body">
                    {historyLoading ? (
                        <p className="history-panel__empty">Loading history...</p>
                    ) : versions.length === 0 ? (
                        <p className="history-panel__empty">
                            No history yet. Keep editing and the first checkpoint will appear automatically.
                        </p>
                    ) : (
                        <ul className="history-list">
                            {versions.map((version) => (
                                <li className="history-list__item" key={version.versionId}>
                                    <div className="history-list__meta">
                                        <p className="history-list__timestamp">
                                            {formatHistoryTimestamp(version.createdAt)}
                                        </p>
                                        <p className="history-list__author">
                                            {version.savedBy?.displayName || "Guest"}
                                        </p>
                                    </div>
                                    <span className="history-list__source">
                                        {VERSION_SOURCE_LABELS[version.source] || version.source}
                                    </span>
                                    <button
                                        className="history-list__restore"
                                        type="button"
                                        disabled={historyLoading || restoringVersionId != null}
                                        onClick={() => handleRestoreRequest(version.versionId)}
                                    >
                                        {restoringVersionId === version.versionId ? "Restoring..." : "Restore"}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </aside>
        </div>
    )
}
