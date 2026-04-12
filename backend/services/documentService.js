const { randomUUID } = require("crypto")
const Y = require("yjs")

const Document = require("../models/Document")

const defaultValue = ""
const DEFAULT_DOCUMENT_TITLE = "Untitled document"
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
const DOCUMENT_PERMISSIONS = {
    EDITOR: "editor",
    OWNER: "owner",
}

class DocumentServiceError extends Error {
    constructor(message, statusCode = 400) {
        super(message)
        this.name = "DocumentServiceError"
        this.statusCode = statusCode
    }
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
        clientId: savedBy.clientId || savedBy.id,
        displayName: savedBy.displayName || DEFAULT_SAVED_BY.displayName,
    }
}

function getUserId(user) {
    return user?.id || user?.userId || null
}

function normalizeTitle(title) {
    const normalizedTitle = title?.trim()

    return normalizedTitle || DEFAULT_DOCUMENT_TITLE
}

function normalizeOwner(user) {
    const ownerId = getUserId(user)
    if (!ownerId) {
        throw new DocumentServiceError("Authentication required.", 401)
    }

    return {
        ownerDisplayName: user.displayName || "Unknown user",
        ownerEmail: user.email || "",
        ownerId,
    }
}

function mapCollaborator(user) {
    return {
        userId: getUserId(user),
        displayName: user.displayName || "Unknown user",
        email: user.email || "",
        role: DOCUMENT_PERMISSIONS.EDITOR,
    }
}

function isDocumentOwner(document, userId) {
    return Boolean(userId) && document.ownerId === userId
}

function hasDocumentAccess(document, userId) {
    if (!userId) return false
    if (isDocumentOwner(document, userId)) return true

    return (document.collaborators || []).some((collaborator) => collaborator.userId === userId)
}

function buildDocumentSummary(document, userId) {
    return {
        documentId: document._id,
        title: document.title || DEFAULT_DOCUMENT_TITLE,
        permission: isDocumentOwner(document, userId)
            ? DOCUMENT_PERMISSIONS.OWNER
            : DOCUMENT_PERMISSIONS.EDITOR,
        owner: document.ownerId
            ? {
                id: document.ownerId,
                displayName: document.ownerDisplayName,
                email: document.ownerEmail,
            }
            : null,
        collaborators: (document.collaborators || []).map((collaborator) => ({
            displayName: collaborator.displayName,
            email: collaborator.email,
            role: collaborator.role,
            userId: collaborator.userId,
        })),
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
    }
}

function assignOwner(document, user) {
    const owner = normalizeOwner(user)

    document.ownerId = owner.ownerId
    document.ownerDisplayName = owner.ownerDisplayName
    document.ownerEmail = owner.ownerEmail

    if (!document.title) {
        document.title = DEFAULT_DOCUMENT_TITLE
    }
}

function ensureAccess(document, user) {
    const userId = getUserId(user)

    if (!document.ownerId) {
        assignOwner(document, user)
        return true
    }

    if (hasDocumentAccess(document, userId)) {
        return false
    }

    throw new DocumentServiceError("You do not have access to this document.", 403)
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

async function findOrCreateAccessibleDocument(id, user) {
    const document = await findOrCreateDocument(id)
    if (!document) return null

    const ownershipWasAssigned = ensureAccess(document, user)
    if (ownershipWasAssigned) {
        await document.save()
    }

    return document
}

async function listAccessibleDocuments(user) {
    const userId = getUserId(user)
    if (!userId) {
        throw new DocumentServiceError("Authentication required.", 401)
    }

    const documents = await Document.find({
        $or: [
            { ownerId: userId },
            { "collaborators.userId": userId },
        ],
    }).sort({ updatedAt: -1 })

    return {
        documents: documents.map((document) => buildDocumentSummary(document, userId)),
    }
}

async function createDocument(payload = {}, user) {
    const owner = normalizeOwner(user)

    const document = await Document.create({
        _id: randomUUID(),
        title: normalizeTitle(payload.title),
        ownerId: owner.ownerId,
        ownerDisplayName: owner.ownerDisplayName,
        ownerEmail: owner.ownerEmail,
        data: defaultValue,
        contentFormat: CONTENT_FORMATS.LEGACY_QUILL_DELTA,
    })

    return {
        document: buildDocumentSummary(document, owner.ownerId),
    }
}

async function getDocumentMetadata(id, user) {
    const document = await findOrCreateAccessibleDocument(id, user)
    if (!document) return null

    return {
        document: buildDocumentSummary(document, getUserId(user)),
    }
}

async function loadDocumentState(id, user) {
    const document = await findOrCreateAccessibleDocument(id, user)
    if (!document) return null

    return getDocumentLoadPayload(document)
}

async function loadDocumentHistory(id, user) {
    const document = await findOrCreateAccessibleDocument(id, user)
    if (!document) return null

    return getDocumentHistoryPayload(document, id)
}

async function saveDocument(id, { data, yjsStateBase64 } = {}, savedBy, user) {
    if (!id) return null

    const document = await findOrCreateAccessibleDocument(id, user)
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

async function restoreDocumentVersion(id, versionId, savedBy, user) {
    if (!id || !versionId) return null

    const document = await findOrCreateAccessibleDocument(id, user)
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

async function shareDocumentWithUser(id, userToShare, currentUser) {
    const document = await findOrCreateAccessibleDocument(id, currentUser)
    if (!document) return null

    const currentUserId = getUserId(currentUser)
    if (!isDocumentOwner(document, currentUserId)) {
        throw new DocumentServiceError("Only the document owner can share access.", 403)
    }

    if (userToShare.id === currentUserId) {
        throw new DocumentServiceError("You already own this document.", 400)
    }

    const collaboratorIndex = (document.collaborators || []).findIndex(
        (collaborator) => collaborator.userId === userToShare.id
    )
    const collaborator = mapCollaborator(userToShare)

    if (collaboratorIndex >= 0) {
        document.collaborators[collaboratorIndex] = collaborator
    } else {
        document.collaborators = [...(document.collaborators || []), collaborator]
    }

    await document.save()

    return {
        document: buildDocumentSummary(document, currentUserId),
    }
}

module.exports = {
    CHECKPOINT_INTERVAL_MS,
    CONTENT_FORMATS,
    createDocument,
    MAX_DOCUMENT_VERSIONS,
    VERSION_SOURCES,
    decodeBase64ToUint8Array,
    DocumentServiceError,
    encodeUpdateToBase64,
    findOrCreateDocument,
    getDocumentMetadata,
    loadDocumentHistory,
    loadDocumentState,
    listAccessibleDocuments,
    restoreDocumentVersion,
    saveDocument,
    shareDocumentWithUser,
}
