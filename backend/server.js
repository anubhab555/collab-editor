const http = require("http")
const { Server } = require("socket.io")

const connectToDatabase = require("./config/db")
const registerSocketHandlers = require("./websocket/socketHandler")

const PORT = Number(process.env.SOCKET_PORT) || 3001
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000"

async function startServer() {
    await connectToDatabase()

    const httpServer = http.createServer()
    const io = new Server(httpServer, {
        cors: {
            origin: CLIENT_ORIGIN,
            methods: ["GET", "POST"],
        },
    })

    registerSocketHandlers(io)

    httpServer.listen(PORT, () => {
        console.log(`Socket server listening on port ${PORT}`)
    })
}

startServer().catch((error) => {
    console.error("Failed to start backend server", error)
    process.exit(1)
})
