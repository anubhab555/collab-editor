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

export default function TextEditor() {
    const { id: documentId } = useParams()
    const [quill, setQuill] = useState()
    const [socket, setSocket] = useState()
    const [collaborator] = useState(() => getOrCreateCollaborator())
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
        cursorManagerRef.current?.clearAll()
        quill.disable()
        quill.setText("Loading...")

        const session = createYjsSession(documentId)
        yjsSessionRef.current = session

        session.handleDocUpdate = (update, origin) => {
            if (yjsSessionRef.current !== session) return
            if (!documentReadyRef.current || origin !== session.binding) return

            socket.emit("yjs-update", { update })
        }

        session.ydoc.on("update", session.handleDocUpdate)

        const handleLoadDocument = ({ yjsStateBase64 } = {}) => {
            if (yjsSessionRef.current !== session) return

            const baselineUpdate = base64ToUint8Array(yjsStateBase64)

            if (baselineUpdate.byteLength > 0) {
                Y.applyUpdate(session.ydoc, baselineUpdate, YJS_INITIAL_ORIGIN)
            }

            session.binding = new QuillBinding(session.yText, quill)
            quill.enable()
            documentReadyRef.current = true

            socket.emit("join-document", {
                documentId,
                user: collaborator,
            })

            cursorManagerRef.current?.scheduleRender()
        }

        socket.once("load-document", handleLoadDocument)
        socket.emit("get-document", documentId)

        return () => {
            emitCursorMove(null, { force: true })
            documentReadyRef.current = false
            cursorManagerRef.current?.clearAll()
            socket.off("load-document", handleLoadDocument)
            quill.disable()
            destroyYjsSession(session)

            if (yjsSessionRef.current === session) {
                yjsSessionRef.current = null
            }
        }
    }, [socket, quill, documentId, collaborator, emitCursorMove])

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
        if (socket == null) return

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
        socket.on("cursor-update", handleCursorUpdate)
        socket.on("cursor-remove", handleCursorRemove)

        return () => {
            socket.off("yjs-update", handleYjsUpdate)
            socket.off("request-document-sync", handleRequestDocumentSync)
            socket.off("document-sync", handleDocumentSync)
            socket.off("cursor-update", handleCursorUpdate)
            socket.off("cursor-remove", handleCursorRemove)
        }
    }, [socket, collaborator.clientId])

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

    return <div className="container" ref={wrapperRef}></div>
}
