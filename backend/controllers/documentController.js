const {
    loadDocumentState,
    saveDocument,
} = require("../services/documentService")

async function loadDocument(documentId) {
    return loadDocumentState(documentId)
}

async function persistDocument(documentId, payload) {
    return saveDocument(documentId, payload)
}

module.exports = {
    loadDocument,
    persistDocument,
}
