const Y = require("yjs")

const Document = require("../models/Document")

const defaultValue = ""
const CONTENT_FORMATS = {
    LEGACY_QUILL_DELTA: "quill-delta",
    YJS: "yjs",
}

function encodeUpdateToBase64(update) {
    return Buffer.from(update).toString("base64")
}

function decodeBase64ToUint8Array(base64) {
    return new Uint8Array(Buffer.from(base64, "base64"))
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

function getDocumentLoadPayload(document) {
    const yjsStateBase64 = document.yjsState || buildYjsStateFromLegacyData(document.data)

    return {
        yjsStateBase64,
        contentFormat: document.yjsState
            ? CONTENT_FORMATS.YJS
            : CONTENT_FORMATS.LEGACY_QUILL_DELTA,
    }
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

async function saveDocument(id, { data, yjsStateBase64 } = {}) {
    if (!id) return null

    const nextData = data ?? defaultValue
    const nextYjsState = typeof yjsStateBase64 === "string" && yjsStateBase64.length > 0
        ? yjsStateBase64
        : buildYjsStateFromLegacyData(nextData)

    return Document.findByIdAndUpdate(
        id,
        {
            data: nextData,
            yjsState: nextYjsState,
            contentFormat: CONTENT_FORMATS.YJS,
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
        }
    )
}

module.exports = {
    CONTENT_FORMATS,
    decodeBase64ToUint8Array,
    encodeUpdateToBase64,
    findOrCreateDocument,
    loadDocumentState,
    saveDocument,
}
