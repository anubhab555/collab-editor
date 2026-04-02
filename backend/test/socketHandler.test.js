const test = require("node:test")
const assert = require("node:assert/strict")
const http = require("http")

const { Server } = require("socket.io")
const { io: createClient } = require("socket.io-client")

const { createSocketHandler } = require("../websocket/socketHandler")

function waitForEvent(socket, eventName, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            socket.off(eventName, handleEvent)
            reject(new Error(`Timed out waiting for "${eventName}"`))
        }, timeoutMs)

        const handleEvent = (payload) => {
            clearTimeout(timeoutId)
            resolve(payload)
        }

        socket.once(eventName, handleEvent)
    })
}

async function listen(server) {
    await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", resolve)
    })

    return server.address().port
}

async function connectClient(port) {
    const socket = createClient(`http://127.0.0.1:${port}`, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
    })

    await waitForEvent(socket, "connect")
    return socket
}

async function createHarness(controllerOverrides = {}) {
    const controllers = {
        loadDocument: async () => ({
            yjsStateBase64: "baseline-state",
            contentFormat: "yjs",
        }),
        loadHistory: async () => ({
            documentId: "doc-1",
            versions: [],
        }),
        persistDocument: async () => null,
        restoreVersion: async () => null,
        ...controllerOverrides,
    }

    const httpServer = http.createServer()
    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
    })

    createSocketHandler(controllers)(io)

    const port = await listen(httpServer)

    return {
        controllers,
        httpServer,
        io,
        port,
    }
}

async function closeClient(socket) {
    if (!socket) return

    await new Promise((resolve) => {
        socket.once("disconnect", resolve)
        socket.disconnect()
    })
}

test("get-document-history returns version metadata to the active socket", async (context) => {
    const harness = await createHarness({
        loadHistory: async (documentId) => ({
            documentId,
            versions: [
                {
                    versionId: "version-1",
                    createdAt: "2026-04-02T12:00:00.000Z",
                    savedBy: {
                        clientId: "user-1",
                        displayName: "Anubhab",
                    },
                    source: "checkpoint",
                },
            ],
        }),
    })

    const client = await connectClient(harness.port)

    context.after(async () => {
        await closeClient(client)
        await harness.io.close()
        await new Promise((resolve) => harness.httpServer.close(resolve))
    })

    const loadDocumentPromise = waitForEvent(client, "load-document")
    client.emit("get-document", "doc-1")
    await loadDocumentPromise

    const historyPromise = waitForEvent(client, "document-history")
    client.emit("get-document-history", { documentId: "doc-1" })
    const history = await historyPromise

    assert.equal(history.documentId, "doc-1")
    assert.equal(history.versions.length, 1)
    assert.deepEqual(history.versions[0].savedBy, {
        clientId: "user-1",
        displayName: "Anubhab",
    })
})

test("save-document broadcasts document-history-updated when a checkpoint is created", async (context) => {
    const persistCalls = []
    const harness = await createHarness({
        persistDocument: async (documentId, payload) => {
            persistCalls.push({
                documentId,
                payload,
            })

            return {
                historyUpdated: true,
                history: {
                    documentId,
                    versions: [
                        {
                            versionId: "version-1",
                            createdAt: "2026-04-02T12:00:00.000Z",
                            savedBy: {
                                clientId: "user-1",
                                displayName: "Anubhab",
                            },
                            source: "checkpoint",
                        },
                    ],
                },
            }
        },
    })

    const clientA = await connectClient(harness.port)
    const clientB = await connectClient(harness.port)

    context.after(async () => {
        await closeClient(clientA)
        await closeClient(clientB)
        await harness.io.close()
        await new Promise((resolve) => harness.httpServer.close(resolve))
    })

    clientA.emit("get-document", "doc-1")
    await waitForEvent(clientA, "load-document")
    clientA.emit("join-document", {
        documentId: "doc-1",
        user: {
            clientId: "user-1",
            displayName: "Anubhab",
            color: "#1864ab",
        },
    })

    clientB.emit("get-document", "doc-1")
    await waitForEvent(clientB, "load-document")

    const updatedForA = waitForEvent(clientA, "document-history-updated")
    const updatedForB = waitForEvent(clientB, "document-history-updated")

    clientA.emit("save-document", {
        data: { ops: [{ insert: "Hello world\n" }] },
        yjsStateBase64: "state-1",
    })

    const [historyForA, historyForB] = await Promise.all([updatedForA, updatedForB])

    assert.equal(historyForA.documentId, "doc-1")
    assert.equal(historyForB.versions[0].versionId, "version-1")
    assert.equal(persistCalls.length, 1)
    assert.equal(persistCalls[0].documentId, "doc-1")
    assert.equal(persistCalls[0].payload.payload.yjsStateBase64, "state-1")
    assert.equal(persistCalls[0].payload.savedBy.displayName, "Anubhab")
})

test("restore-version broadcasts restored content and refreshed history to the room", async (context) => {
    const restoreCalls = []
    const harness = await createHarness({
        restoreVersion: async (documentId, payload) => {
            restoreCalls.push({
                documentId,
                payload,
            })

            return {
                history: {
                    documentId,
                    versions: [
                        {
                            versionId: "backup-1",
                            createdAt: "2026-04-02T12:05:00.000Z",
                            savedBy: {
                                clientId: "user-1",
                                displayName: "Anubhab",
                            },
                            source: "restore-backup",
                        },
                    ],
                },
                document: {
                    yjsStateBase64: "restored-state",
                },
                restoredVersionId: payload.versionId,
                restoredBy: {
                    clientId: "user-1",
                    displayName: "Anubhab",
                },
            }
        },
    })

    const clientA = await connectClient(harness.port)
    const clientB = await connectClient(harness.port)

    context.after(async () => {
        await closeClient(clientA)
        await closeClient(clientB)
        await harness.io.close()
        await new Promise((resolve) => harness.httpServer.close(resolve))
    })

    clientA.emit("get-document", "doc-1")
    await waitForEvent(clientA, "load-document")
    clientA.emit("join-document", {
        documentId: "doc-1",
        user: {
            clientId: "user-1",
            displayName: "Anubhab",
            color: "#1864ab",
        },
    })

    clientB.emit("get-document", "doc-1")
    await waitForEvent(clientB, "load-document")

    const historyUpdatedForA = waitForEvent(clientA, "document-history-updated")
    const historyUpdatedForB = waitForEvent(clientB, "document-history-updated")
    const restoredForA = waitForEvent(clientA, "document-restored")
    const restoredForB = waitForEvent(clientB, "document-restored")

    clientA.emit("restore-version", {
        documentId: "doc-1",
        versionId: "version-7",
    })

    const [historyForA, historyForB, restoreForA, restoreForB] = await Promise.all([
        historyUpdatedForA,
        historyUpdatedForB,
        restoredForA,
        restoredForB,
    ])

    assert.equal(historyForA.versions[0].source, "restore-backup")
    assert.equal(historyForB.documentId, "doc-1")
    assert.equal(restoreForA.yjsStateBase64, "restored-state")
    assert.equal(restoreForB.versionId, "version-7")
    assert.equal(restoreCalls.length, 1)
    assert.equal(restoreCalls[0].payload.savedBy.displayName, "Anubhab")
})

test("join-document requests awareness sync and forwards the first awareness snapshot to the joining client", async (context) => {
    const harness = await createHarness()

    const clientA = await connectClient(harness.port)
    const clientB = await connectClient(harness.port)

    context.after(async () => {
        await closeClient(clientA)
        await closeClient(clientB)
        await harness.io.close()
        await new Promise((resolve) => harness.httpServer.close(resolve))
    })

    clientA.emit("get-document", "doc-1")
    await waitForEvent(clientA, "load-document")
    clientA.emit("join-document", {
        documentId: "doc-1",
        user: {
            clientId: "user-1",
            displayName: "Alice",
            color: "#1864ab",
        },
    })

    clientB.emit("get-document", "doc-1")
    await waitForEvent(clientB, "load-document")

    const awarenessSyncRequest = waitForEvent(clientA, "request-awareness-sync")
    clientB.emit("join-document", {
        documentId: "doc-1",
        user: {
            clientId: "user-2",
            displayName: "Bob",
            color: "#d9480f",
        },
    })

    const request = await awarenessSyncRequest
    const update = Uint8Array.from([1, 4, 9, 16])
    const awarenessUpdate = waitForEvent(clientB, "awareness-update")

    clientA.emit("awareness-sync", {
        documentId: "doc-1",
        requestId: request.requestId,
        targetSocketId: request.targetSocketId,
        update,
    })

    const forwardedUpdate = await awarenessUpdate

    assert.equal(forwardedUpdate.documentId, "doc-1")
    assert.deepEqual(Array.from(forwardedUpdate.update), Array.from(update))
})

test("awareness updates relay to peers and awareness-leave removes stale presence", async (context) => {
    const harness = await createHarness()

    const clientA = await connectClient(harness.port)
    const clientB = await connectClient(harness.port)

    context.after(async () => {
        await closeClient(clientA)
        await closeClient(clientB)
        await harness.io.close()
        await new Promise((resolve) => harness.httpServer.close(resolve))
    })

    clientA.emit("get-document", "doc-1")
    await waitForEvent(clientA, "load-document")
    clientA.emit("join-document", {
        documentId: "doc-1",
        user: {
            clientId: "user-1",
            displayName: "Alice",
            color: "#1864ab",
        },
    })

    clientB.emit("get-document", "doc-1")
    await waitForEvent(clientB, "load-document")
    clientB.emit("join-document", {
        documentId: "doc-1",
        user: {
            clientId: "user-2",
            displayName: "Bob",
            color: "#d9480f",
        },
    })

    const update = Uint8Array.from([7, 8, 9])
    const relayedAwarenessUpdate = waitForEvent(clientB, "awareness-update")

    clientA.emit("awareness-update", {
        awarenessClientId: 42,
        documentId: "doc-1",
        update,
    })

    const awarenessPayload = await relayedAwarenessUpdate
    assert.equal(awarenessPayload.documentId, "doc-1")
    assert.deepEqual(Array.from(awarenessPayload.update), Array.from(update))

    const awarenessRemoval = waitForEvent(clientB, "awareness-remove")

    clientA.emit("awareness-leave", {
        documentId: "doc-1",
        awarenessClientIds: [42],
    })

    const removalPayload = await awarenessRemoval
    assert.equal(removalPayload.documentId, "doc-1")
    assert.deepEqual(removalPayload.awarenessClientIds, [42])
})
