const {
    findOrCreateDocument,
    saveDocument,
} = require("../services/documentService")

async function loadDocument(documentId) {
    return findOrCreateDocument(documentId)
}

async function persistDocument(documentId, data) {
    return saveDocument(documentId, data)
}

module.exports = {
    loadDocument,
    persistDocument,
}
