const {
    loadDocument,
    persistDocument,
} = require("../controllers/documentController")

function emitCursorRemoval(socket, documentId) {
    if (!documentId || !socket.data.user?.clientId) return

    socket.to(documentId).emit("cursor-remove", {
        clientId: socket.data.user.clientId,
    })
}

function registerSocketHandlers(io) {
    io.on("connection", (socket) => {
        socket.on("get-document", async (documentId) => {
            const document = await loadDocument(documentId)
            if (!document) return

            const previousDocumentId = socket.data.documentId

            if (previousDocumentId) {
                emitCursorRemoval(socket, previousDocumentId)
                socket.leave(previousDocumentId)
            }

            socket.data.documentId = documentId
            socket.join(documentId)
            socket.emit("load-document", document.data)
        })

        socket.on("join-document", ({ documentId, user } = {}) => {
            if (!documentId || socket.data.documentId !== documentId || !user?.clientId) {
                return
            }

            socket.data.user = {
                clientId: user.clientId,
                displayName: user.displayName,
                color: user.color,
            }
        })

        socket.on("send-changes", (delta) => {
            const { documentId } = socket.data
            if (!documentId) return

            socket.broadcast.to(documentId).emit("receive-changes", delta)
        })

        socket.on("cursor-move", ({ range } = {}) => {
            const { documentId, user } = socket.data
            if (!documentId || !user?.clientId) return

            socket.to(documentId).emit("cursor-update", {
                user,
                range,
            })
        })

        socket.on("save-document", async (data) => {
            const { documentId } = socket.data
            if (!documentId) return

            await persistDocument(documentId, data)
        })

        socket.on("disconnect", () => {
            emitCursorRemoval(socket, socket.data.documentId)
        })
    })
}

module.exports = registerSocketHandlers
