const {
    loadDocumentHistory,
    loadDocumentState,
    restoreDocumentVersion,
    saveDocument,
} = require("../services/documentService")

async function loadDocument(documentId) {
    return loadDocumentState(documentId)
}

async function persistDocument(documentId, payload) {
    return saveDocument(documentId, payload.payload, payload.savedBy)
}

async function loadHistory(documentId) {
    return loadDocumentHistory(documentId)
}

async function restoreVersion(documentId, payload) {
    return restoreDocumentVersion(documentId, payload.versionId, payload.savedBy)
}

module.exports = {
    loadHistory,
    loadDocument,
    persistDocument,
    restoreVersion,
}
