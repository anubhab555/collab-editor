const {
    createDocument,
    getDocumentMetadata,
    listAccessibleDocuments,
    loadDocumentHistory,
    loadDocumentState,
    restoreDocumentVersion,
    saveDocument,
    shareDocumentWithUser,
} = require("../services/documentService")
const { findUserByEmail } = require("../services/authService")

async function loadDocument(documentId, user) {
    return loadDocumentState(documentId, user)
}

async function persistDocument(documentId, payload) {
    return saveDocument(documentId, payload.payload, payload.savedBy, payload.user)
}

async function loadHistory(documentId, user) {
    return loadDocumentHistory(documentId, user)
}

async function restoreVersion(documentId, payload) {
    return restoreDocumentVersion(documentId, payload.versionId, payload.savedBy, payload.user)
}

async function listDocuments(user) {
    return listAccessibleDocuments(user)
}

async function createNewDocument(payload, user) {
    return createDocument(payload, user)
}

async function getMetadata(documentId, user) {
    return getDocumentMetadata(documentId, user)
}

async function shareDocument(documentId, payload, user) {
    const sharedWithUser = await findUserByEmail(payload.email)

    return shareDocumentWithUser(documentId, sharedWithUser, user)
}

module.exports = {
    createDocument: createNewDocument,
    getDocumentMetadata: getMetadata,
    loadHistory,
    loadDocument,
    listDocuments,
    persistDocument,
    restoreVersion,
    shareDocument,
}
