const test = require("node:test")
const assert = require("node:assert/strict")

const Document = require("../models/Document")
const {
    CHECKPOINT_INTERVAL_MS,
    createDocument,
    getDocumentMetadata,
    loadDocumentHistory,
    listAccessibleDocuments,
    MAX_DOCUMENT_VERSIONS,
    restoreDocumentVersion,
    saveDocument,
    shareDocumentWithUser,
    VERSION_SOURCES,
} = require("../services/documentService")

const OWNER_USER = {
    id: "user-1",
    displayName: "Anubhab",
    email: "anubhab@example.com",
}
const COLLABORATOR_USER = {
    id: "user-2",
    displayName: "Collaborator",
    email: "collaborator@example.com",
}

function clone(value) {
    return JSON.parse(JSON.stringify(value))
}

function createFakeDocument(store, payload = {}) {
    const document = {
        _id: payload._id,
        title: payload.title ?? "Untitled document",
        ownerId: payload.ownerId ?? null,
        ownerDisplayName: payload.ownerDisplayName ?? null,
        ownerEmail: payload.ownerEmail ?? null,
        collaborators: clone(payload.collaborators || []),
        data: payload.data ?? "",
        yjsState: payload.yjsState ?? null,
        contentFormat: payload.contentFormat ?? "quill-delta",
        versions: clone(payload.versions || []),
        createdAt: payload.createdAt ?? new Date("2026-04-02T12:00:00.000Z"),
        updatedAt: payload.updatedAt ?? new Date("2026-04-02T12:00:00.000Z"),
        async save() {
            this.updatedAt = new Date(Date.now())
            store.set(this._id, this)
            return this
        },
    }

    return document
}

function installDocumentModelMocks(context, store) {
    const originalFindById = Document.findById
    const originalCreate = Document.create
    const originalFind = Document.find

    Document.findById = async (id) => store.get(id) || null
    Document.create = async (payload) => {
        const document = createFakeDocument(store, payload)
        store.set(document._id, document)
        return document
    }
    Document.find = (query) => {
        const userId = query.$or[0].ownerId
        const documents = Array.from(store.values())
            .filter((document) => (
                document.ownerId === userId
                || document.collaborators.some((collaborator) => collaborator.userId === userId)
            ))
            .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))

        return {
            sort: async () => documents,
        }
    }

    context.after(() => {
        Document.find = originalFind
        Document.findById = originalFindById
        Document.create = originalCreate
    })
}

test("saveDocument creates timed checkpoints only when content changes", async (context) => {
    const store = new Map()
    const originalDateNow = Date.now
    installDocumentModelMocks(context, store)

    let currentTime = Date.parse("2026-04-02T12:00:00.000Z")
    Date.now = () => currentTime

    context.after(() => {
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
        },
        OWNER_USER
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
        },
        OWNER_USER
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
        },
        OWNER_USER
    )

    assert.equal(laterResult.historyUpdated, true)
    assert.equal(laterResult.history.versions.length, 2)
    assert.equal(laterResult.history.versions[0].savedBy.displayName, "Collaborator")

    const history = await loadDocumentHistory("doc-1", OWNER_USER)
    assert.equal(history.versions.length, 2)
    assert.equal(Object.hasOwn(history.versions[0], "yjsState"), false)
    assert.equal(Object.hasOwn(history.versions[0], "data"), false)
})

test("saveDocument skips checkpoints for blank content", async (context) => {
    const store = new Map()
    installDocumentModelMocks(context, store)

    const blankResult = await saveDocument(
        "doc-blank",
        {
            data: { ops: [{ insert: "\n" }] },
            yjsStateBase64: "blank-state",
        },
        {
            clientId: "user-blank",
            displayName: "Blank Editor",
        },
        OWNER_USER
    )

    assert.equal(blankResult.historyUpdated, false)
    assert.equal(blankResult.history.versions.length, 0)

    const storedDocument = store.get("doc-blank")
    assert.equal(storedDocument.yjsState, "blank-state")
    assert.deepEqual(storedDocument.data, { ops: [{ insert: "\n" }] })
})

test("saveDocument creates a later checkpoint after the interval even if the active state was already autosaved", async (context) => {
    const store = new Map()
    const originalDateNow = Date.now
    installDocumentModelMocks(context, store)

    let currentTime = Date.parse("2026-04-02T12:00:00.000Z")
    Date.now = () => currentTime

    context.after(() => {
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
        },
        OWNER_USER
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
        },
        OWNER_USER
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
        },
        OWNER_USER
    )

    assert.equal(delayedCheckpoint.historyUpdated, true)
    assert.equal(delayedCheckpoint.history.versions.length, 2)
    assert.equal(delayedCheckpoint.history.versions[0].savedBy.displayName, "Collaborator")
})

test("saveDocument caps timed checkpoints at the latest configured retention", async (context) => {
    const store = new Map()
    const originalDateNow = Date.now
    installDocumentModelMocks(context, store)

    let currentTime = Date.parse("2026-04-02T12:00:00.000Z")
    Date.now = () => currentTime

    context.after(() => {
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
            },
            OWNER_USER
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
    const originalDateNow = Date.now
    installDocumentModelMocks(context, store)

    let currentTime = Date.parse("2026-04-02T12:00:00.000Z")
    Date.now = () => currentTime

    context.after(() => {
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
        },
        OWNER_USER
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
        },
        OWNER_USER
    )

    const documentBeforeRestore = store.get("doc-3")
    const targetVersionId = documentBeforeRestore.versions[1].versionId

    const restoreResult = await restoreDocumentVersion(
        "doc-3",
        targetVersionId,
        {
            clientId: "user-3",
            displayName: "Restorer",
        },
        OWNER_USER
    )

    const restoredDocument = store.get("doc-3")

    assert.equal(restoreResult.document.yjsStateBase64, "state-1")
    assert.equal(restoredDocument.yjsState, "state-1")
    assert.equal(restoredDocument.versions[0].source, VERSION_SOURCES.RESTORE_BACKUP)
    assert.equal(restoredDocument.versions[0].yjsState, "state-2")
    assert.equal(restoredDocument.versions[0].savedBy.displayName, "Restorer")
})

test("restoreDocumentVersion skips creating a backup when the active state already matches the target", async (context) => {
    const store = new Map()
    installDocumentModelMocks(context, store)

    store.set("doc-no-backup", createFakeDocument(store, {
        _id: "doc-no-backup",
        ownerId: OWNER_USER.id,
        ownerDisplayName: OWNER_USER.displayName,
        ownerEmail: OWNER_USER.email,
        data: { ops: [{ insert: "Current text\n" }] },
        yjsState: "same-state",
        contentFormat: "yjs",
        versions: [
            {
                versionId: "version-same",
                createdAt: "2026-04-02T12:00:00.000Z",
                savedBy: {
                    clientId: "user-1",
                    displayName: "Original Author",
                },
                source: VERSION_SOURCES.CHECKPOINT,
                yjsState: "same-state",
                data: { ops: [{ insert: "Current text\n" }] },
            },
        ],
    }))

    const restoreResult = await restoreDocumentVersion(
        "doc-no-backup",
        "version-same",
        {
            clientId: "user-2",
            displayName: "Restorer",
        },
        OWNER_USER
    )

    const restoredDocument = store.get("doc-no-backup")

    assert.equal(restoreResult.restoredVersionId, "version-same")
    assert.equal(restoredDocument.yjsState, "same-state")
    assert.equal(restoredDocument.versions.length, 1)
    assert.equal(restoredDocument.versions[0].source, VERSION_SOURCES.CHECKPOINT)
})

test("createDocument, listAccessibleDocuments, and shareDocumentWithUser enforce access metadata", async (context) => {
    const store = new Map()
    installDocumentModelMocks(context, store)

    const created = await createDocument({ title: "Architecture Notes" }, OWNER_USER)
    assert.equal(created.document.permission, "owner")

    const shared = await shareDocumentWithUser(
        created.document.documentId,
        COLLABORATOR_USER,
        OWNER_USER
    )
    assert.equal(shared.document.collaborators.length, 1)
    assert.equal(shared.document.collaborators[0].email, COLLABORATOR_USER.email)

    const ownerList = await listAccessibleDocuments(OWNER_USER)
    const collaboratorList = await listAccessibleDocuments(COLLABORATOR_USER)
    assert.equal(ownerList.documents.length, 1)
    assert.equal(collaboratorList.documents.length, 1)
    assert.equal(collaboratorList.documents[0].permission, "editor")

    const metadata = await getDocumentMetadata(created.document.documentId, COLLABORATOR_USER)
    assert.equal(metadata.document.title, "Architecture Notes")
    assert.equal(metadata.document.owner.email, OWNER_USER.email)
})
