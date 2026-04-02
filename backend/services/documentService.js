const { randomUUID } = require("crypto")
const Y = require("yjs")

const Document = require("../models/Document")

const defaultValue = ""
const CONTENT_FORMATS = {
    LEGACY_QUILL_DELTA: "quill-delta",
    YJS: "yjs",
}
const VERSION_SOURCES = {
    CHECKPOINT: "checkpoint",
    RESTORE_BACKUP: "restore-backup",
}
const MAX_DOCUMENT_VERSIONS = 20
const CHECKPOINT_INTERVAL_MS = Number(process.env.CHECKPOINT_INTERVAL_MS) || 30000
const DEFAULT_SAVED_BY = {
    clientId: "guest",
    displayName: "Guest",
}

function encodeUpdateToBase64(update) {
    return Buffer.from(update).toString("base64")
}

function decodeBase64ToUint8Array(base64) {
    return new Uint8Array(Buffer.from(base64, "base64"))
}

function normalizeSavedBy(savedBy) {
    if (!savedBy?.clientId) {
        return {
            ...DEFAULT_SAVED_BY,
        }
    }

    return {
        clientId: savedBy.clientId,
        displayName: savedBy.displayName || DEFAULT_SAVED_BY.displayName,
    }
}

function applyLegacyDataToYText(yText, data) {
    if (!data) return

    if (typeof data === "string") {
        if (data.length > 0) {
            yText.insert(0, data)
        }

        return
    }

    if (Array.isArray(data)) {
        yText.applyDelta(data)
        return
    }

    if (Array.isArray(data.ops)) {
        yText.applyDelta(data.ops)
    }
}

function buildYjsStateFromLegacyData(data) {
    const ydoc = new Y.Doc()
    const yText = ydoc.getText("quill")

    applyLegacyDataToYText(yText, data)

    return encodeUpdateToBase64(Y.encodeStateAsUpdate(ydoc))
}

function getActiveYjsState(document) {
    return document.yjsState || buildYjsStateFromLegacyData(document.data)
}

function getDocumentLoadPayload(document) {
    const yjsStateBase64 = getActiveYjsState(document)

    return {
        yjsStateBase64,
        contentFormat: document.yjsState
            ? CONTENT_FORMATS.YJS
            : CONTENT_FORMATS.LEGACY_QUILL_DELTA,
    }
}

function getDocumentHistoryPayload(document, documentId = document?._id) {
    return {
        documentId,
        versions: (document.versions || []).map((version) => ({
            versionId: version.versionId,
            createdAt: version.createdAt,
            savedBy: normalizeSavedBy(version.savedBy),
            source: version.source,
        })),
    }
}

function getDeltaOps(data) {
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.ops)) return data.ops
    return null
}

function isDocumentBlank(data) {
    if (!data) return true

    if (typeof data === "string") {
        return data.trim().length === 0
    }

    const ops = getDeltaOps(data)
    if (!ops || ops.length === 0) return true

    return !ops.some((operation) => {
        if (typeof operation.insert === "string") {
            return operation.insert.replace(/\n/g, "").trim().length > 0
        }

        return operation.insert != null
    })
}

function trimVersions(versions) {
    return versions.slice(0, MAX_DOCUMENT_VERSIONS)
}

function createVersionEntry({ data, yjsState, savedBy, source }) {
    return {
        versionId: randomUUID(),
        createdAt: new Date(Date.now()),
        savedBy: normalizeSavedBy(savedBy),
        source,
        yjsState,
        data: data ?? defaultValue,
    }
}

function prependVersion(document, versionEntry) {
    document.versions = trimVersions([versionEntry, ...(document.versions || [])])
}

function shouldCreateCheckpoint(document, { data, yjsState }) {
    if (isDocumentBlank(data)) return false

    const latestCheckpoint = (document.versions || []).find(
        (version) => version.source === VERSION_SOURCES.CHECKPOINT
    )

    if (!latestCheckpoint) return true
    if (latestCheckpoint.yjsState === yjsState) return false

    return Date.now() - new Date(latestCheckpoint.createdAt).getTime() >= CHECKPOINT_INTERVAL_MS
}

function setActiveDocumentState(document, { data, yjsState }) {
    document.data = data ?? defaultValue
    document.yjsState = yjsState
    document.contentFormat = CONTENT_FORMATS.YJS
}

async function findOrCreateDocument(id) {
    if (!id) return null

    const existingDocument = await Document.findById(id)
    if (existingDocument) return existingDocument

    return Document.create({
        _id: id,
        data: defaultValue,
        contentFormat: CONTENT_FORMATS.LEGACY_QUILL_DELTA,
    })
}

async function loadDocumentState(id) {
    const document = await findOrCreateDocument(id)
    if (!document) return null

    return getDocumentLoadPayload(document)
}

async function loadDocumentHistory(id) {
    const document = await findOrCreateDocument(id)
    if (!document) return null

    return getDocumentHistoryPayload(document, id)
}

async function saveDocument(id, { data, yjsStateBase64 } = {}, savedBy) {
    if (!id) return null

    const document = await findOrCreateDocument(id)
    if (!document) return null

    const nextData = data ?? defaultValue
    const nextYjsState = typeof yjsStateBase64 === "string" && yjsStateBase64.length > 0
        ? yjsStateBase64
        : buildYjsStateFromLegacyData(nextData)
    const historyUpdated = shouldCreateCheckpoint(document, {
        data: nextData,
        yjsState: nextYjsState,
    })

    if (historyUpdated) {
        prependVersion(document, createVersionEntry({
            data: nextData,
            yjsState: nextYjsState,
            savedBy,
            source: VERSION_SOURCES.CHECKPOINT,
        }))
    }

    setActiveDocumentState(document, {
        data: nextData,
        yjsState: nextYjsState,
    })

    await document.save()

    return {
        document: getDocumentLoadPayload(document),
        history: getDocumentHistoryPayload(document, id),
        historyUpdated,
    }
}

async function restoreDocumentVersion(id, versionId, savedBy) {
    if (!id || !versionId) return null

    const document = await findOrCreateDocument(id)
    if (!document) return null

    const version = (document.versions || []).find((entry) => entry.versionId === versionId)
    if (!version) return null

    const targetData = version.data ?? defaultValue
    const targetYjsState = version.yjsState || buildYjsStateFromLegacyData(targetData)
    const currentData = document.data ?? defaultValue
    const currentYjsState = getActiveYjsState(document)

    if (currentYjsState !== targetYjsState) {
        prependVersion(document, createVersionEntry({
            data: currentData,
            yjsState: currentYjsState,
            savedBy,
            source: VERSION_SOURCES.RESTORE_BACKUP,
        }))
    }

    setActiveDocumentState(document, {
        data: targetData,
        yjsState: targetYjsState,
    })

    await document.save()

    return {
        document: getDocumentLoadPayload(document),
        history: getDocumentHistoryPayload(document, id),
        restoredVersionId: version.versionId,
        restoredBy: normalizeSavedBy(savedBy),
    }
}

module.exports = {
    CHECKPOINT_INTERVAL_MS,
    CONTENT_FORMATS,
    MAX_DOCUMENT_VERSIONS,
    VERSION_SOURCES,
    decodeBase64ToUint8Array,
    encodeUpdateToBase64,
    findOrCreateDocument,
    loadDocumentHistory,
    loadDocumentState,
    restoreDocumentVersion,
    saveDocument,
}
