import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Quill from "quill"
import "quill/dist/quill.snow.css"
import { io } from "socket.io-client"
import { useNavigate, useParams } from "react-router-dom"
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness"
import * as Y from "yjs"
import { QuillBinding } from "y-quill"

import { useAuth } from "./AuthContext"
import { apiRequest } from "./api"
import CursorManager from "./CursorManager"
import DocumentAccessPanel from "./DocumentAccessPanel"
import PresencePanel from "./PresencePanel"
import VersionHistoryPanel from "./VersionHistoryPanel"


const SAVE_INTERVAL_MS = Number(process.env.REACT_APP_SAVE_INTERVAL_MS) || 2000
const AWARENESS_HEARTBEAT_INTERVAL_MS = 4000
const CURSOR_EMIT_INTERVAL_MS = 75
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
const YJS_INITIAL_ORIGIN = Symbol("yjs-initial-origin")
const YJS_REMOTE_ORIGIN = Symbol("yjs-remote-origin")
const YJS_PEER_SYNC_ORIGIN = Symbol("yjs-peer-sync-origin")
const YJS_AWARENESS_REMOTE_ORIGIN = Symbol("yjs-awareness-remote-origin")

function getSocketServerUrl() {
    if (process.env.REACT_APP_SOCKET_URL) {
        return process.env.REACT_APP_SOCKET_URL
    }

    if (process.env.NODE_ENV === "development") {
        return "http://localhost:3001"
    }

    if (typeof window !== "undefined") {
        return window.location.origin
    }

    return "http://localhost:3001"
}

const SOCKET_SERVER_URL = getSocketServerUrl()

function getStableHash(value) {
    let hash = 0

    for (let index = 0; index < value.length; index += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(index)
        hash |= 0
    }

    return Math.abs(hash)
}

function getCollaboratorFromUser(user) {
    if (!user?.id) return null

    return {
        clientId: user.id,
        color: CURSOR_COLORS[getStableHash(user.id) % CURSOR_COLORS.length],
        displayName: user.displayName,
    }
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

function normalizeAwarenessClientId(value) {
    if (!Number.isFinite(value)) return null

    return Number(value)
}

function normalizeAwarenessClientIds(values = []) {
    const clientIds = new Set()

    for (const value of values) {
        const clientId = normalizeAwarenessClientId(value)
        if (clientId == null) continue

        clientIds.add(clientId)
    }

    return Array.from(clientIds)
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
        awareness: new Awareness(ydoc),
        binding: null,
        handleDocUpdate: null,
        handleAwarenessUpdate: null,
        handleAwarenessChange: null,
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

    if (session.handleAwarenessUpdate) {
        session.awareness.off("update", session.handleAwarenessUpdate)
    }

    if (session.handleAwarenessChange) {
        session.awareness.off("change", session.handleAwarenessChange)
    }

    session.ydoc.destroy()
}

function buildPresenceSnapshot(session, collaborator) {
    const remoteCursors = []
    const rosterByUserId = new Map()

    for (const [awarenessClientId, awarenessState] of session.awareness.getStates()) {
        const user = awarenessState?.user
        if (!user?.clientId) continue

        const isLocal = user.clientId === collaborator.clientId
        const existingEntry = rosterByUserId.get(user.clientId)

        if (!existingEntry || (isLocal && !existingEntry.isLocal)) {
            rosterByUserId.set(user.clientId, {
                color: user.color,
                displayName: user.displayName,
                isLocal,
                userId: user.clientId,
            })
        }

        if (isLocal) continue

        remoteCursors.push({
            cursorId: awarenessClientId,
            range: normalizeRange(awarenessState?.cursor),
            user,
        })
    }

    const collaborators = Array.from(rosterByUserId.values()).sort((left, right) => {
        if (left.isLocal !== right.isLocal) {
            return left.isLocal ? -1 : 1
        }

        return left.displayName.localeCompare(right.displayName)
    })

    return {
        collaborators,
        remoteCursors,
    }
}

export default function TextEditor() {
    const { id: documentId } = useParams()
    const navigate = useNavigate()
    const { logout, token, user } = useAuth()
    const collaborator = useMemo(() => getCollaboratorFromUser(user), [user])
    const [quill, setQuill] = useState()
    const [socket, setSocket] = useState()
    const [activeCollaborators, setActiveCollaborators] = useState([])
    const [documentDetails, setDocumentDetails] = useState(null)
    const [documentError, setDocumentError] = useState("")
    const [editorAccessLoading, setEditorAccessLoading] = useState(true)
    const [shareEmail, setShareEmail] = useState("")
    const [shareError, setShareError] = useState("")
    const [shareSubmitting, setShareSubmitting] = useState(false)
    const [shareSuccess, setShareSuccess] = useState("")
    const [versions, setVersions] = useState([])
    const [historyLoading, setHistoryLoading] = useState(true)
    const [restoringVersionId, setRestoringVersionId] = useState(null)
    const cursorManagerRef = useRef(null)
    const yjsSessionRef = useRef(null)
    const documentReadyRef = useRef(false)
    const postLoadRequestTimeoutRef = useRef(null)
    const cursorThrottleRef = useRef({
        lastSentAt: 0,
        timeoutId: null,
        pendingRange: null,
    })

    const handleAuthFailure = useCallback(() => {
        logout()
        navigate("/auth", { replace: true })
    }, [logout, navigate])

    const resetPresenceUi = useCallback(() => {
        setActiveCollaborators([])
        cursorManagerRef.current?.clearAll()
    }, [])

    const clearPendingCursorThrottle = useCallback(() => {
        const throttleState = cursorThrottleRef.current

        if (throttleState.timeoutId != null) {
            window.clearTimeout(throttleState.timeoutId)
            throttleState.timeoutId = null
        }

        throttleState.pendingRange = null
    }, [])

    const syncPresenceFromAwareness = useCallback((session = yjsSessionRef.current) => {
        if (!session || yjsSessionRef.current !== session || !collaborator) {
            resetPresenceUi()
            return
        }

        const { collaborators: nextCollaborators, remoteCursors } = buildPresenceSnapshot(
            session,
            collaborator
        )

        setActiveCollaborators(nextCollaborators)
        cursorManagerRef.current?.syncCursors(remoteCursors)
    }, [collaborator, resetPresenceUi])

    const publishJoinDocument = useCallback(() => {
        if (socket == null || !documentReadyRef.current || !collaborator) return

        socket.emit("join-document", {
            documentId,
            user: collaborator,
        })
    }, [socket, documentId, collaborator])

    const scheduleSessionStartupRequests = useCallback((nextDocumentId = documentId) => {
        if (postLoadRequestTimeoutRef.current != null) {
            window.clearTimeout(postLoadRequestTimeoutRef.current)
        }

        postLoadRequestTimeoutRef.current = window.setTimeout(() => {
            postLoadRequestTimeoutRef.current = null
            publishJoinDocument()
            socket?.emit("get-document-history", { documentId: nextDocumentId })
        }, 0)
    }, [documentId, publishJoinDocument, socket])

    const leaveAwarenessSession = useCallback((session) => {
        if (socket == null || !session) return

        socket.emit("awareness-leave", {
            documentId: session.documentId,
        })
    }, [socket])

    const updateLocalCursorPresence = useCallback((range, options = {}) => {
        const { force = false } = options
        if (!collaborator) return
        if (!force && !documentReadyRef.current) return

        const throttleState = cursorThrottleRef.current
        const normalizedRange = normalizeRange(range)

        const applyCursorState = (nextRange) => {
            throttleState.pendingRange = null
            const session = yjsSessionRef.current
            if (!session || session.documentId !== documentId) return

            throttleState.lastSentAt = Date.now()

            const localState = session.awareness.getLocalState() || {}
            session.awareness.setLocalState({
                ...localState,
                user: collaborator,
                cursor: nextRange,
            })
        }

        if (force) {
            if (throttleState.timeoutId != null) {
                window.clearTimeout(throttleState.timeoutId)
                throttleState.timeoutId = null
            }

            applyCursorState(normalizedRange)
            return
        }

        const now = Date.now()
        const elapsed = now - throttleState.lastSentAt

        if (elapsed >= CURSOR_EMIT_INTERVAL_MS) {
            applyCursorState(normalizedRange)
            return
        }

        throttleState.pendingRange = normalizedRange

        if (throttleState.timeoutId != null) return

        throttleState.timeoutId = window.setTimeout(() => {
            throttleState.timeoutId = null
            applyCursorState(throttleState.pendingRange)
        }, CURSOR_EMIT_INTERVAL_MS - elapsed)
    }, [collaborator, documentId])

    const mountSessionFromSnapshot = useCallback((yjsStateBase64, origin = YJS_INITIAL_ORIGIN) => {
        if (socket == null || quill == null || !collaborator) return null

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

        session.handleAwarenessUpdate = ({ added, updated, removed }, updateOrigin) => {
            if (yjsSessionRef.current !== session) return
            if (!documentReadyRef.current || updateOrigin !== "local") return

            const changedClientIds = normalizeAwarenessClientIds([...added, ...updated, ...removed])
            if (changedClientIds.length === 0) return

            socket.emit("awareness-update", {
                awarenessClientId: session.awareness.clientID,
                documentId,
                update: encodeAwarenessUpdate(session.awareness, changedClientIds),
            })
        }

        session.handleAwarenessChange = () => {
            if (yjsSessionRef.current !== session) return

            syncPresenceFromAwareness(session)
        }

        session.ydoc.on("update", session.handleDocUpdate)
        session.awareness.on("update", session.handleAwarenessUpdate)
        session.awareness.on("change", session.handleAwarenessChange)

        const baselineUpdate = base64ToUint8Array(yjsStateBase64)
        if (baselineUpdate.byteLength > 0) {
            Y.applyUpdate(session.ydoc, baselineUpdate, origin)
        }

        session.binding = new QuillBinding(session.yText, quill)
        quill.enable()
        documentReadyRef.current = true

        session.awareness.setLocalState({
            cursor: normalizeRange(quill.getSelection()),
            user: collaborator,
        })
        syncPresenceFromAwareness(session)

        return session
    }, [collaborator, documentId, quill, socket, syncPresenceFromAwareness])

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

    const refreshDocumentDetails = useCallback(async () => {
        setEditorAccessLoading(true)
        setDocumentError("")

        try {
            const payload = await apiRequest(`/documents/${documentId}`, {
                token,
            })

            setDocumentDetails(payload.document)
        } catch (error) {
            if (error.statusCode === 401) {
                handleAuthFailure()
                return
            }

            setDocumentError(error.message || "Unable to load document access details.")
        } finally {
            setEditorAccessLoading(false)
        }
    }, [documentId, handleAuthFailure, token])

    const handleShareSubmit = useCallback(async (event) => {
        event.preventDefault()
        setShareError("")
        setShareSuccess("")
        setShareSubmitting(true)

        try {
            const payload = await apiRequest(`/documents/${documentId}/share`, {
                body: { email: shareEmail },
                method: "POST",
                token,
            })

            setDocumentDetails(payload.document)
            setShareEmail("")
            setShareSuccess("Access granted successfully.")
        } catch (error) {
            if (error.statusCode === 401) {
                handleAuthFailure()
                return
            }

            setShareError(error.message || "Unable to share document access.")
        } finally {
            setShareSubmitting(false)
        }
    }, [documentId, handleAuthFailure, shareEmail, token])

    useEffect(() => {
        refreshDocumentDetails()
    }, [refreshDocumentDetails])

    useEffect(() => {
        if (!token) return undefined

        const s = io(SOCKET_SERVER_URL, {
            auth: {
                token,
            },
        })

        const handleConnectError = (error) => {
            const statusCode = error?.data?.statusCode

            if (statusCode === 401) {
                handleAuthFailure()
                return
            }

            setDocumentError(error.message || "Unable to connect to the collaborative backend.")
        }

        s.on("connect_error", handleConnectError)
        setSocket(s)

        return () => {
            s.off("connect_error", handleConnectError)
            s.disconnect()
        }
    }, [handleAuthFailure, token])

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
        setDocumentError("")
        setActiveCollaborators([])
        setShareEmail("")
        setShareError("")
        setShareSuccess("")
        setVersions([])
        setHistoryLoading(true)
        setRestoringVersionId(null)
        resetPresenceUi()
        quill.disable()
        quill.setText("Loading...")

        const handleLoadDocument = ({ yjsStateBase64 } = {}) => {
            const session = mountSessionFromSnapshot(yjsStateBase64)
            if (!session) return

            scheduleSessionStartupRequests(documentId)
        }

        socket.once("load-document", handleLoadDocument)
        socket.emit("get-document", documentId)

        return () => {
            documentReadyRef.current = false
            setActiveCollaborators([])
            setVersions([])
            setHistoryLoading(true)
            setRestoringVersionId(null)
            socket.off("load-document", handleLoadDocument)
            quill.disable()

            if (postLoadRequestTimeoutRef.current != null) {
                window.clearTimeout(postLoadRequestTimeoutRef.current)
                postLoadRequestTimeoutRef.current = null
            }

            const currentSession = yjsSessionRef.current
            clearPendingCursorThrottle()
            leaveAwarenessSession(currentSession)
            resetPresenceUi()
            destroyYjsSession(currentSession)
            yjsSessionRef.current = null
        }
    }, [
        socket,
        quill,
        clearPendingCursorThrottle,
        documentId,
        leaveAwarenessSession,
        mountSessionFromSnapshot,
        resetPresenceUi,
        scheduleSessionStartupRequests,
    ])

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

        const interval = setInterval(() => {
            const session = yjsSessionRef.current
            if (!documentReadyRef.current || !session || session.documentId !== documentId) return

            const localState = session.awareness.getLocalState()
            if (!localState?.user) return

            session.awareness.setLocalState(localState)
        }, AWARENESS_HEARTBEAT_INTERVAL_MS)

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

        const handleRequestAwarenessSync = ({
            documentId: syncDocumentId,
            requestId,
            targetSocketId,
        } = {}) => {
            const session = yjsSessionRef.current
            if (!session || session.documentId !== syncDocumentId) return
            if (!requestId || !targetSocketId || targetSocketId === socket.id) return

            const awarenessClientIds = normalizeAwarenessClientIds(
                Array.from(session.awareness.getStates().keys())
            )
            if (awarenessClientIds.length === 0) return

            socket.emit("awareness-sync", {
                documentId: syncDocumentId,
                requestId,
                targetSocketId,
                update: encodeAwarenessUpdate(session.awareness, awarenessClientIds),
            })
        }

        const handleAwarenessUpdate = ({ documentId: awarenessDocumentId, update } = {}) => {
            const session = yjsSessionRef.current
            if (!session || session.documentId !== awarenessDocumentId) return

            const normalizedUpdate = normalizeBinaryUpdate(update)
            if (!normalizedUpdate) return

            applyAwarenessUpdate(session.awareness, normalizedUpdate, YJS_AWARENESS_REMOTE_ORIGIN)
        }

        const handleAwarenessRemove = ({ documentId: awarenessDocumentId, awarenessClientIds } = {}) => {
            const session = yjsSessionRef.current
            if (!session || session.documentId !== awarenessDocumentId) return

            const normalizedClientIds = normalizeAwarenessClientIds(awarenessClientIds)
            if (normalizedClientIds.length === 0) return

            removeAwarenessStates(session.awareness, normalizedClientIds, YJS_AWARENESS_REMOTE_ORIGIN)
        }

        const handleDocumentHistory = ({ documentId: historyDocumentId, versions: nextVersions = [] } = {}) => {
            if (historyDocumentId !== documentId) return

            setVersions(nextVersions)
            setHistoryLoading(false)
        }

        const handleDocumentHistoryUpdated = ({
            documentId: historyDocumentId,
            versions: nextVersions = [],
        } = {}) => {
            if (historyDocumentId !== documentId) return

            setVersions(nextVersions)
            setHistoryLoading(false)
        }

        const handleDocumentRestored = ({ documentId: restoredDocumentId, yjsStateBase64 } = {}) => {
            if (restoredDocumentId !== documentId) return

            const currentSession = yjsSessionRef.current
            clearPendingCursorThrottle()
            leaveAwarenessSession(currentSession)
            resetPresenceUi()
            documentReadyRef.current = false
            quill.disable()
            quill.setText("Restoring...")

            const session = mountSessionFromSnapshot(yjsStateBase64, YJS_INITIAL_ORIGIN)
            if (session) {
                scheduleSessionStartupRequests(restoredDocumentId)
            }

            setRestoringVersionId(null)
        }

        const handleDocumentError = ({ message, statusCode } = {}) => {
            if (statusCode === 401) {
                handleAuthFailure()
                return
            }

            setDocumentError(message || "Unable to load the requested document.")
            setHistoryLoading(false)
            setRestoringVersionId(null)
        }

        socket.on("yjs-update", handleYjsUpdate)
        socket.on("request-document-sync", handleRequestDocumentSync)
        socket.on("document-sync", handleDocumentSync)
        socket.on("request-awareness-sync", handleRequestAwarenessSync)
        socket.on("awareness-update", handleAwarenessUpdate)
        socket.on("awareness-remove", handleAwarenessRemove)
        socket.on("document-history", handleDocumentHistory)
        socket.on("document-history-updated", handleDocumentHistoryUpdated)
        socket.on("document-restored", handleDocumentRestored)
        socket.on("document-error", handleDocumentError)

        return () => {
            socket.off("yjs-update", handleYjsUpdate)
            socket.off("request-document-sync", handleRequestDocumentSync)
            socket.off("document-sync", handleDocumentSync)
            socket.off("request-awareness-sync", handleRequestAwarenessSync)
            socket.off("awareness-update", handleAwarenessUpdate)
            socket.off("awareness-remove", handleAwarenessRemove)
            socket.off("document-history", handleDocumentHistory)
            socket.off("document-history-updated", handleDocumentHistoryUpdated)
            socket.off("document-restored", handleDocumentRestored)
            socket.off("document-error", handleDocumentError)
        }
    }, [
        documentId,
        clearPendingCursorThrottle,
        handleAuthFailure,
        leaveAwarenessSession,
        mountSessionFromSnapshot,
        quill,
        resetPresenceUi,
        scheduleSessionStartupRequests,
        socket,
    ])

    useEffect(() => {
        if (socket == null || quill == null) return

        const handleTextChange = (rawDelta, oldDelta, source) => {
            const delta = new Delta(rawDelta)

            cursorManagerRef.current?.transformCursors(delta)
            cursorManagerRef.current?.scheduleRender()

            if (source !== "user") return

            updateLocalCursorPresence(quill.getSelection())
        }

        const handleSelectionChange = (range, oldRange, source) => {
            if (source === "silent") return

            updateLocalCursorPresence(range, { force: range == null })
        }

        const handleBlur = () => {
            updateLocalCursorPresence(null, { force: true })
        }

        quill.on("text-change", handleTextChange)
        quill.on("selection-change", handleSelectionChange)
        quill.root.addEventListener("blur", handleBlur)

        return () => {
            quill.off("text-change", handleTextChange)
            quill.off("selection-change", handleSelectionChange)
            quill.root.removeEventListener("blur", handleBlur)
        }
    }, [socket, quill, updateLocalCursorPresence])

    useEffect(() => clearPendingCursorThrottle, [clearPendingCursorThrottle])

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
                {documentError ? (
                    <div className="editor-alert editor-alert--error" role="alert">
                        {documentError}
                    </div>
                ) : null}
                <div className="container" ref={wrapperRef}></div>
            </div>
            <div className="editor-sidebar">
                <DocumentAccessPanel
                    documentDetails={documentDetails}
                    loading={editorAccessLoading}
                    onLogout={logout}
                    onShareEmailChange={setShareEmail}
                    onShareSubmit={handleShareSubmit}
                    shareEmail={shareEmail}
                    shareError={shareError}
                    shareSubmitting={shareSubmitting}
                    shareSuccess={shareSuccess}
                />
                <PresencePanel collaborators={activeCollaborators} />
                <VersionHistoryPanel
                    historyLoading={historyLoading}
                    restoringVersionId={restoringVersionId}
                    versions={versions}
                    onRestore={handleRestoreRequest}
                />
            </div>
        </div>
    )
}
