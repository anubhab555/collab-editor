const crypto = require("crypto")

const documentController = require("../controllers/documentController")

const DOCUMENT_SYNC_TIMEOUT_MS = 5000

const pendingDocumentSyncs = new Map()
const pendingAwarenessSyncs = new Map()

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
    const awarenessClientIds = new Set()

    for (const value of values) {
        const awarenessClientId = normalizeAwarenessClientId(value)
        if (awarenessClientId == null) continue

        awarenessClientIds.add(awarenessClientId)
    }

    return Array.from(awarenessClientIds)
}

function clearPendingSync(pendingSyncs, requestId) {
    if (!requestId) return

    const pendingSync = pendingSyncs.get(requestId)
    if (!pendingSync) return

    clearTimeout(pendingSync.timeoutId)
    pendingSyncs.delete(requestId)
}

function registerPendingSync(pendingSyncs, documentId, targetSocketId) {
    const requestId = crypto.randomUUID()
    const timeoutId = setTimeout(() => {
        pendingSyncs.delete(requestId)
    }, DOCUMENT_SYNC_TIMEOUT_MS)

    pendingSyncs.set(requestId, {
        documentId,
        fulfilled: false,
        targetSocketId,
        timeoutId,
    })

    return requestId
}

function fulfillPendingSync(pendingSyncs, io, eventName, { requestId, documentId, targetSocketId, payload }) {
    const pendingSync = pendingSyncs.get(requestId)
    if (!pendingSync) return false
    if (pendingSync.fulfilled) return false
    if (pendingSync.documentId !== documentId || pendingSync.targetSocketId !== targetSocketId) {
        return false
    }

    pendingSync.fulfilled = true
    clearPendingSync(pendingSyncs, requestId)

    io.to(targetSocketId).emit(eventName, {
        documentId,
        ...payload,
    })

    return true
}

function emitAwarenessRemoval(emitter, documentId, awarenessClientIds) {
    const normalizedClientIds = normalizeAwarenessClientIds(awarenessClientIds)
    if (!documentId || normalizedClientIds.length === 0) return

    emitter.to(documentId).emit("awareness-remove", {
        awarenessClientIds: normalizedClientIds,
        documentId,
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

function createSocketHandler({
    loadDocument,
    loadHistory,
    persistDocument,
    restoreVersion,
} = documentController) {
    return function registerSocketHandlers(io) {
        io.on("resolve-document-sync", (payload = {}) => {
            const update = normalizeBinaryUpdate(payload.update)
            if (!update) return

            fulfillPendingSync(pendingDocumentSyncs, io, "document-sync", {
                documentId: payload.documentId,
                payload: { update },
                requestId: payload.requestId,
                targetSocketId: payload.targetSocketId,
            })
        })

        io.on("resolve-awareness-sync", (payload = {}) => {
            const update = normalizeBinaryUpdate(payload.update)
            if (!update) return

            fulfillPendingSync(pendingAwarenessSyncs, io, "awareness-update", {
                documentId: payload.documentId,
                payload: { update },
                requestId: payload.requestId,
                targetSocketId: payload.targetSocketId,
            })
        })

        io.on("connection", (socket) => {
            socket.on("get-document", async (documentId) => {
                const document = await loadDocument(documentId)
                if (!document) return

                const previousDocumentId = socket.data.documentId
                const previousAwarenessClientId = socket.data.awarenessClientId

                if (previousDocumentId) {
                    emitAwarenessRemoval(socket, previousDocumentId, [previousAwarenessClientId])
                    socket.leave(previousDocumentId)
                }

                clearPendingSync(pendingDocumentSyncs, socket.data.pendingDocumentSyncRequestId)
                clearPendingSync(pendingAwarenessSyncs, socket.data.pendingAwarenessSyncRequestId)
                socket.data.pendingDocumentSyncRequestId = null
                socket.data.pendingAwarenessSyncRequestId = null
                socket.data.documentId = documentId
                socket.data.awarenessClientId = null
                socket.join(documentId)
                socket.emit("load-document", document)

                const roomSockets = await io.in(documentId).allSockets()

                if (roomSockets.size > 1) {
                    const requestId = registerPendingSync(
                        pendingDocumentSyncs,
                        documentId,
                        socket.id
                    )

                    socket.data.pendingDocumentSyncRequestId = requestId
                    socket.to(documentId).emit("request-document-sync", {
                        documentId,
                        requestId,
                        targetSocketId: socket.id,
                    })
                }
            })

            socket.on("join-document", async ({ documentId, user } = {}) => {
                if (!documentId || socket.data.documentId !== documentId || !user?.clientId) {
                    return
                }

                socket.data.user = {
                    clientId: user.clientId,
                    color: user.color,
                    displayName: user.displayName,
                }

                clearPendingSync(pendingAwarenessSyncs, socket.data.pendingAwarenessSyncRequestId)
                socket.data.pendingAwarenessSyncRequestId = null

                const roomSockets = await io.in(documentId).allSockets()
                if (roomSockets.size <= 1) return

                const requestId = registerPendingSync(
                    pendingAwarenessSyncs,
                    documentId,
                    socket.id
                )

                socket.data.pendingAwarenessSyncRequestId = requestId
                socket.to(documentId).emit("request-awareness-sync", {
                    documentId,
                    requestId,
                    targetSocketId: socket.id,
                })
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

                const fulfilledLocally = fulfillPendingSync(
                    pendingDocumentSyncs,
                    io,
                    "document-sync",
                    {
                        documentId,
                        payload: { update: normalizedUpdate },
                        requestId,
                        targetSocketId,
                    }
                )

                if (!fulfilledLocally) {
                    io.serverSideEmit("resolve-document-sync", {
                        documentId,
                        requestId,
                        targetSocketId,
                        update: normalizedUpdate,
                    })
                }
            })

            socket.on("awareness-update", ({ documentId, awarenessClientId, update } = {}) => {
                if (!documentId || socket.data.documentId !== documentId) return

                const normalizedUpdate = normalizeBinaryUpdate(update)
                if (!normalizedUpdate) return

                const normalizedAwarenessClientId = normalizeAwarenessClientId(awarenessClientId)
                if (normalizedAwarenessClientId != null) {
                    socket.data.awarenessClientId = normalizedAwarenessClientId
                }

                socket.to(documentId).emit("awareness-update", {
                    documentId,
                    update: normalizedUpdate,
                })
            })

            socket.on("awareness-sync", ({ documentId, requestId, targetSocketId, update } = {}) => {
                if (!documentId || socket.data.documentId !== documentId || !requestId || !targetSocketId) {
                    return
                }

                const normalizedUpdate = normalizeBinaryUpdate(update)
                if (!normalizedUpdate) return

                const fulfilledLocally = fulfillPendingSync(
                    pendingAwarenessSyncs,
                    io,
                    "awareness-update",
                    {
                        documentId,
                        payload: { update: normalizedUpdate },
                        requestId,
                        targetSocketId,
                    }
                )

                if (!fulfilledLocally) {
                    io.to(targetSocketId).emit("awareness-update", {
                        documentId,
                        update: normalizedUpdate,
                    })

                    io.serverSideEmit("resolve-awareness-sync", {
                        documentId,
                        requestId,
                        targetSocketId,
                        update: normalizedUpdate,
                    })
                }
            })

            socket.on("awareness-leave", ({ documentId, awarenessClientIds } = {}) => {
                if (!documentId || socket.data.documentId !== documentId) return

                const normalizedClientIds = normalizeAwarenessClientIds(
                    awarenessClientIds?.length > 0
                        ? awarenessClientIds
                        : [socket.data.awarenessClientId]
                )
                if (normalizedClientIds.length === 0) return

                if (normalizedClientIds.includes(socket.data.awarenessClientId)) {
                    socket.data.awarenessClientId = null
                }

                emitAwarenessRemoval(socket, documentId, normalizedClientIds)
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
                    restoredBy: result.restoredBy,
                    versionId: result.restoredVersionId,
                    yjsStateBase64: result.document.yjsStateBase64,
                })
            })

            socket.on("disconnect", () => {
                clearPendingSync(pendingDocumentSyncs, socket.data.pendingDocumentSyncRequestId)
                clearPendingSync(pendingAwarenessSyncs, socket.data.pendingAwarenessSyncRequestId)
                emitAwarenessRemoval(socket, socket.data.documentId, [socket.data.awarenessClientId])
            })
        })
    }
}

const registerSocketHandlers = createSocketHandler()

module.exports = registerSocketHandlers
module.exports.createSocketHandler = createSocketHandler
