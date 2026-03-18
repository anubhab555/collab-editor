import { useCallback, useEffect, useRef, useState } from "react"
import Quill from "quill"
import "quill/dist/quill.snow.css"
import { io } from "socket.io-client"
import { useParams } from "react-router-dom"
import { v4 as uuidV4 } from "uuid"

import CursorManager from "./CursorManager"


const SAVE_INTERVAL_MS = 2000
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
const CLIENT_ID_STORAGE_KEY = "collab-editor-client-id"
const DISPLAY_NAME_STORAGE_KEY = "collab-editor-display-name"

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

export default function TextEditor() {
    const { id: documentId } = useParams()
    const [quill, setQuill] = useState()
    const [socket, setSocket] = useState()
    const [collaborator] = useState(() => getOrCreateCollaborator())
    const cursorManagerRef = useRef(null)
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
        const s = io("http://localhost:3001")
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

        const handleLoadDocument = (document) => {
            quill.setContents(document)
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
        }
    }, [socket, quill, documentId, collaborator, emitCursorMove])


    useEffect(() => {
        if (socket == null || quill == null) return

        const interval = setInterval(() => {
            socket.emit("save-document", quill.getContents())
        }, SAVE_INTERVAL_MS)

        return () => {
            clearInterval(interval)
        }

    }, [socket, quill])


    useEffect(() => {
        if (socket == null || quill == null) return

        const handleReceiveChanges = (rawDelta) => {
            quill.updateContents(new Delta(rawDelta))
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

        socket.on("receive-changes", handleReceiveChanges)
        socket.on("cursor-update", handleCursorUpdate)
        socket.on("cursor-remove", handleCursorRemove)

        return () => {
            socket.off("receive-changes", handleReceiveChanges)
            socket.off("cursor-update", handleCursorUpdate)
            socket.off("cursor-remove", handleCursorRemove)
        }
    }, [socket, quill, collaborator.clientId])

    useEffect(() => {
        if (socket == null || quill == null) return

        const handleTextChange = (rawDelta, oldDelta, source) => {
            const delta = new Delta(rawDelta)

            cursorManagerRef.current?.transformCursors(delta)
            cursorManagerRef.current?.scheduleRender()

            if (source !== "user") return

            socket.emit("send-changes", delta)
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
