const test = require("node:test")
const assert = require("node:assert/strict")

const Document = require("../models/Document")
const {
    CHECKPOINT_INTERVAL_MS,
    MAX_DOCUMENT_VERSIONS,
    VERSION_SOURCES,
    loadDocumentHistory,
    restoreDocumentVersion,
    saveDocument,
} = require("../services/documentService")

function clone(value) {
    return JSON.parse(JSON.stringify(value))
}

function createFakeDocument(store, payload = {}) {
    const document = {
        _id: payload._id,
        data: payload.data ?? "",
        yjsState: payload.yjsState ?? null,
        contentFormat: payload.contentFormat ?? "quill-delta",
        versions: clone(payload.versions || []),
        async save() {
            store.set(this._id, this)
            return this
        },
    }

    return document
}

test("saveDocument creates timed checkpoints only when content changes", async (context) => {
    const store = new Map()
    const originalFindById = Document.findById
    const originalCreate = Document.create
    const originalDateNow = Date.now

    Document.findById = async (id) => store.get(id) || null
    Document.create = async (payload) => {
        const document = createFakeDocument(store, payload)
        store.set(document._id, document)
        return document
    }

    let currentTime = Date.parse("2026-04-02T12:00:00.000Z")
    Date.now = () => currentTime

    context.after(() => {
        Document.findById = originalFindById
        Document.create = originalCreate
        Date.now = originalDateNow
    })

    const initialResult = await saveDocument(
        "doc-1",
        {
            data: { ops: [{ insert: "Hello world\n" }] },
            yjsStateBase64: "state-1",
        },
        {
            clientId: "user-1",
            displayName: "Anubhab",
        }
    )

    assert.equal(initialResult.historyUpdated, true)
    assert.equal(initialResult.history.versions.length, 1)
    assert.equal(initialResult.history.versions[0].source, VERSION_SOURCES.CHECKPOINT)

    currentTime += 5000

    const unchangedResult = await saveDocument(
        "doc-1",
        {
            data: { ops: [{ insert: "Hello world\n" }] },
            yjsStateBase64: "state-1",
        },
        {
            clientId: "user-1",
            displayName: "Anubhab",
        }
    )

    assert.equal(unchangedResult.historyUpdated, false)
    assert.equal(unchangedResult.history.versions.length, 1)

    currentTime += CHECKPOINT_INTERVAL_MS + 1000

    const laterResult = await saveDocument(
        "doc-1",
        {
            data: { ops: [{ insert: "Hello again\n" }] },
            yjsStateBase64: "state-2",
        },
        {
            clientId: "user-2",
            displayName: "Collaborator",
        }
    )

    assert.equal(laterResult.historyUpdated, true)
    assert.equal(laterResult.history.versions.length, 2)
    assert.equal(laterResult.history.versions[0].savedBy.displayName, "Collaborator")

    const history = await loadDocumentHistory("doc-1")
    assert.equal(history.versions.length, 2)
    assert.equal(Object.hasOwn(history.versions[0], "yjsState"), false)
    assert.equal(Object.hasOwn(history.versions[0], "data"), false)
})

test("saveDocument creates a later checkpoint after the interval even if the active state was already autosaved", async (context) => {
    const store = new Map()
    const originalFindById = Document.findById
    const originalCreate = Document.create
    const originalDateNow = Date.now

    Document.findById = async (id) => store.get(id) || null
    Document.create = async (payload) => {
        const document = createFakeDocument(store, payload)
        store.set(document._id, document)
        return document
    }

    let currentTime = Date.parse("2026-04-02T12:00:00.000Z")
    Date.now = () => currentTime

    context.after(() => {
        Document.findById = originalFindById
        Document.create = originalCreate
        Date.now = originalDateNow
    })

    await saveDocument(
        "doc-interval",
        {
            data: { ops: [{ insert: "Version one\n" }] },
            yjsStateBase64: "state-1",
        },
        {
            clientId: "user-1",
            displayName: "Anubhab",
        }
    )

    currentTime += 1000

    await saveDocument(
        "doc-interval",
        {
            data: { ops: [{ insert: "Version two\n" }] },
            yjsStateBase64: "state-2",
        },
        {
            clientId: "user-2",
            displayName: "Collaborator",
        }
    )

    currentTime += CHECKPOINT_INTERVAL_MS + 1000

    const delayedCheckpoint = await saveDocument(
        "doc-interval",
        {
            data: { ops: [{ insert: "Version two\n" }] },
            yjsStateBase64: "state-2",
        },
        {
            clientId: "user-2",
            displayName: "Collaborator",
        }
    )

    assert.equal(delayedCheckpoint.historyUpdated, true)
    assert.equal(delayedCheckpoint.history.versions.length, 2)
    assert.equal(delayedCheckpoint.history.versions[0].savedBy.displayName, "Collaborator")
})

test("saveDocument caps timed checkpoints at the latest configured retention", async (context) => {
    const store = new Map()
    const originalFindById = Document.findById
    const originalCreate = Document.create
    const originalDateNow = Date.now

    Document.findById = async (id) => store.get(id) || null
    Document.create = async (payload) => {
        const document = createFakeDocument(store, payload)
        store.set(document._id, document)
        return document
    }

    let currentTime = Date.parse("2026-04-02T12:00:00.000Z")
    Date.now = () => currentTime

    context.after(() => {
        Document.findById = originalFindById
        Document.create = originalCreate
        Date.now = originalDateNow
    })

    for (let index = 0; index < MAX_DOCUMENT_VERSIONS + 5; index += 1) {
        await saveDocument(
            "doc-2",
            {
                data: { ops: [{ insert: `Document ${index}\n` }] },
                yjsStateBase64: `state-${index}`,
            },
            {
                clientId: `user-${index}`,
                displayName: `Editor ${index}`,
            }
        )

        currentTime += CHECKPOINT_INTERVAL_MS + 1000
    }

    const document = store.get("doc-2")

    assert.equal(document.versions.length, MAX_DOCUMENT_VERSIONS)
    assert.equal(document.versions[0].data.ops[0].insert, `Document ${MAX_DOCUMENT_VERSIONS + 4}\n`)
    assert.equal(document.versions.at(-1).data.ops[0].insert, "Document 5\n")
})

test("restoreDocumentVersion saves a restore backup before switching active state", async (context) => {
    const store = new Map()
    const originalFindById = Document.findById
    const originalCreate = Document.create
    const originalDateNow = Date.now

    Document.findById = async (id) => store.get(id) || null
    Document.create = async (payload) => {
        const document = createFakeDocument(store, payload)
        store.set(document._id, document)
        return document
    }

    let currentTime = Date.parse("2026-04-02T12:00:00.000Z")
    Date.now = () => currentTime

    context.after(() => {
        Document.findById = originalFindById
        Document.create = originalCreate
        Date.now = originalDateNow
    })

    await saveDocument(
        "doc-3",
        {
            data: { ops: [{ insert: "First version\n" }] },
            yjsStateBase64: "state-1",
        },
        {
            clientId: "user-1",
            displayName: "Anubhab",
        }
    )

    currentTime += CHECKPOINT_INTERVAL_MS + 1000

    await saveDocument(
        "doc-3",
        {
            data: { ops: [{ insert: "Second version\n" }] },
            yjsStateBase64: "state-2",
        },
        {
            clientId: "user-2",
            displayName: "Collaborator",
        }
    )

    const documentBeforeRestore = store.get("doc-3")
    const targetVersionId = documentBeforeRestore.versions[1].versionId

    const restoreResult = await restoreDocumentVersion(
        "doc-3",
        targetVersionId,
        {
            clientId: "user-3",
            displayName: "Restorer",
        }
    )

    const restoredDocument = store.get("doc-3")

    assert.equal(restoreResult.document.yjsStateBase64, "state-1")
    assert.equal(restoredDocument.yjsState, "state-1")
    assert.equal(restoredDocument.versions[0].source, VERSION_SOURCES.RESTORE_BACKUP)
    assert.equal(restoredDocument.versions[0].yjsState, "state-2")
    assert.equal(restoredDocument.versions[0].savedBy.displayName, "Restorer")
})
