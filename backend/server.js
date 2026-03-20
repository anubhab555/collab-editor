const http = require("http")
const { Server } = require("socket.io")

const connectToDatabase = require("./config/db")
const initializeRedisAdapter = require("./config/redisAdapter")
const registerSocketHandlers = require("./websocket/socketHandler")

const PORT = Number(process.env.SOCKET_PORT) || 3001
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000"

function registerGracefulShutdown(httpServer, cleanupRedis) {
    let isShuttingDown = false

    const shutdown = async (signal) => {
        if (isShuttingDown) return

        isShuttingDown = true
        console.log(`[Server] Received ${signal}, shutting down`)

        try {
            await cleanupRedis()

            await new Promise((resolve, reject) => {
                httpServer.close((error) => {
                    if (error) {
                        reject(error)
                        return
                    }

                    resolve()
                })
            })

            process.exit(0)
        } catch (error) {
            console.error("[Server] Graceful shutdown failed", error)
            process.exit(1)
        }
    }

    process.on("SIGINT", () => {
        void shutdown("SIGINT")
    })

    process.on("SIGTERM", () => {
        void shutdown("SIGTERM")
    })
}

async function startServer() {
    await connectToDatabase()

    const httpServer = http.createServer()
    const io = new Server(httpServer, {
        cors: {
            origin: CLIENT_ORIGIN,
            methods: ["GET", "POST"],
        },
    })
    const redisAdapter = await initializeRedisAdapter(io)

    registerSocketHandlers(io)
    registerGracefulShutdown(httpServer, redisAdapter.cleanup)

    httpServer.listen(PORT, () => {
        console.log(`Socket server listening on port ${PORT}`)
    })
}

startServer().catch((error) => {
    console.error("Failed to start backend server", error)
    process.exit(1)
})
