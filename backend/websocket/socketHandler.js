const crypto = require("crypto")

const {
    loadHistory,
    loadDocument,
    persistDocument,
    restoreVersion,
} = require("../controllers/documentController")

const DOCUMENT_SYNC_TIMEOUT_MS = 5000

const pendingDocumentSyncs = new Map()

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

function clearPendingDocumentSync(requestId) {
    if (!requestId) return

    const pendingSync = pendingDocumentSyncs.get(requestId)
    if (!pendingSync) return

    clearTimeout(pendingSync.timeoutId)
    pendingDocumentSyncs.delete(requestId)
}

function registerPendingDocumentSync(documentId, targetSocketId) {
    const requestId = crypto.randomUUID()
    const timeoutId = setTimeout(() => {
        pendingDocumentSyncs.delete(requestId)
    }, DOCUMENT_SYNC_TIMEOUT_MS)

    pendingDocumentSyncs.set(requestId, {
        documentId,
        targetSocketId,
        fulfilled: false,
        timeoutId,
    })

    return requestId
}

function fulfillPendingDocumentSync(io, { requestId, documentId, targetSocketId, update }) {
    const pendingSync = pendingDocumentSyncs.get(requestId)
    if (!pendingSync) return false
    if (pendingSync.fulfilled) return false
    if (pendingSync.documentId !== documentId || pendingSync.targetSocketId !== targetSocketId) {
        return false
    }

    pendingSync.fulfilled = true
    clearPendingDocumentSync(requestId)

    io.to(targetSocketId).emit("document-sync", {
        documentId,
        update,
    })

    return true
}

function emitCursorRemoval(socket, documentId) {
    if (!documentId || !socket.data.user?.clientId) return

    socket.to(documentId).emit("cursor-remove", {
        clientId: socket.data.user.clientId,
    })
}

function emitHistory(socketOrIoTarget, history) {
    if (!history) return

    socketOrIoTarget.emit("document-history", history)
}

function emitHistoryUpdate(io, documentId, history) {
    if (!history || !documentId) return

    io.to(documentId).emit("document-history-updated", history)
}

function registerSocketHandlers(io) {
    io.on("resolve-document-sync", (payload = {}) => {
        const update = normalizeBinaryUpdate(payload.update)
        if (!update) return

        fulfillPendingDocumentSync(io, {
            requestId: payload.requestId,
            documentId: payload.documentId,
            targetSocketId: payload.targetSocketId,
            update,
        })
    })

    io.on("connection", (socket) => {
        socket.on("get-document", async (documentId) => {
            const document = await loadDocument(documentId)
            if (!document) return

            const previousDocumentId = socket.data.documentId

            if (previousDocumentId) {
                emitCursorRemoval(socket, previousDocumentId)
                socket.leave(previousDocumentId)
            }

            clearPendingDocumentSync(socket.data.pendingDocumentSyncRequestId)
            socket.data.pendingDocumentSyncRequestId = null
            socket.data.documentId = documentId
            socket.join(documentId)
            socket.emit("load-document", document)

            const roomSockets = await io.in(documentId).allSockets()

            if (roomSockets.size > 1) {
                const requestId = registerPendingDocumentSync(documentId, socket.id)
                socket.data.pendingDocumentSyncRequestId = requestId

                socket.to(documentId).emit("request-document-sync", {
                    documentId,
                    requestId,
                    targetSocketId: socket.id,
                })
            }
        })

        socket.on("join-document", ({ documentId, user } = {}) => {
            if (!documentId || socket.data.documentId !== documentId || !user?.clientId) {
                return
            }

            socket.data.user = {
                clientId: user.clientId,
                displayName: user.displayName,
                color: user.color,
            }
        })

        socket.on("get-document-history", async ({ documentId } = {}) => {
            if (!documentId || socket.data.documentId !== documentId) return

            const history = await loadHistory(documentId)
            emitHistory(socket, history)
        })

        socket.on("yjs-update", ({ update } = {}) => {
            const { documentId } = socket.data
            if (!documentId) return

            const normalizedUpdate = normalizeBinaryUpdate(update)
            if (!normalizedUpdate) return

            socket.to(documentId).emit("yjs-update", {
                documentId,
                update: normalizedUpdate,
            })
        })

        socket.on("document-sync", ({ documentId, requestId, targetSocketId, update } = {}) => {
            if (!documentId || socket.data.documentId !== documentId || !requestId || !targetSocketId) {
                return
            }

            const normalizedUpdate = normalizeBinaryUpdate(update)
            if (!normalizedUpdate) return

            const fulfilledLocally = fulfillPendingDocumentSync(io, {
                requestId,
                documentId,
                targetSocketId,
                update: normalizedUpdate,
            })

            if (!fulfilledLocally) {
                io.serverSideEmit("resolve-document-sync", {
                    requestId,
                    documentId,
                    targetSocketId,
                    update: normalizedUpdate,
                })
            }
        })

        socket.on("cursor-move", ({ range } = {}) => {
            const { documentId, user } = socket.data
            if (!documentId || !user?.clientId) return

            socket.to(documentId).emit("cursor-update", {
                user,
                range,
            })
        })

        socket.on("save-document", async (payload = {}) => {
            const { documentId } = socket.data
            if (!documentId) return

            const result = await persistDocument(documentId, {
                payload: {
                    data: payload.data,
                    yjsStateBase64: payload.yjsStateBase64,
                },
                savedBy: socket.data.user,
            })

            if (result?.historyUpdated) {
                emitHistoryUpdate(io, documentId, result.history)
            }
        })

        socket.on("restore-version", async ({ documentId, versionId } = {}) => {
            if (!documentId || socket.data.documentId !== documentId || !versionId) return

            const result = await restoreVersion(documentId, {
                versionId,
                savedBy: socket.data.user,
            })

            if (!result) return

            emitHistoryUpdate(io, documentId, result.history)
            io.to(documentId).emit("document-restored", {
                documentId,
                versionId: result.restoredVersionId,
                restoredBy: result.restoredBy,
                yjsStateBase64: result.document.yjsStateBase64,
            })
        })

        socket.on("disconnect", () => {
            clearPendingDocumentSync(socket.data.pendingDocumentSyncRequestId)
            emitCursorRemoval(socket, socket.data.documentId)
        })
    })
}

module.exports = registerSocketHandlers
