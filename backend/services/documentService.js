const Document = require("../models/Document")

const defaultValue = ""

async function findOrCreateDocument(id) {
    if (!id) return null

    const existingDocument = await Document.findById(id)
    if (existingDocument) return existingDocument

    return Document.create({ _id: id, data: defaultValue })
}

async function saveDocument(id, data) {
    if (!id) return null

    return Document.findByIdAndUpdate(
        id,
        { data },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
        }
    )
}

module.exports = {
    findOrCreateDocument,
    saveDocument,
}
