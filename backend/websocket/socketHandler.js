const {
    loadDocument,
    persistDocument,
} = require("../controllers/documentController")

function registerSocketHandlers(io) {
    io.on("connection", (socket) => {
        socket.on("get-document", async (documentId) => {
            const document = await loadDocument(documentId)
            if (!document) return

            const previousDocumentId = socket.data.documentId

            if (previousDocumentId) {
                socket.leave(previousDocumentId)
            }

            socket.data.documentId = documentId
            socket.join(documentId)
            socket.emit("load-document", document.data)
        })

        socket.on("send-changes", (delta) => {
            const { documentId } = socket.data
            if (!documentId) return

            socket.broadcast.to(documentId).emit("receive-changes", delta)
        })

        socket.on("save-document", async (data) => {
            const { documentId } = socket.data
            if (!documentId) return

            await persistDocument(documentId, data)
        })
    })
}

module.exports = registerSocketHandlers
