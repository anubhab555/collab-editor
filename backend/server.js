const http = require("http")
const { Server } = require("socket.io")

const connectToDatabase = require("./config/db")
const initializeRedisAdapter = require("./config/redisAdapter")
const registerSocketHandlers = require("./websocket/socketHandler")

const PORT = Number(process.env.SOCKET_PORT) || 3001
const DEFAULT_CLIENT_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3003",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3003",
]

function getAllowedClientOrigins() {
    const configuredOrigins = process.env.CLIENT_ORIGIN
        ?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)

    return configuredOrigins?.length ? configuredOrigins : DEFAULT_CLIENT_ORIGINS
}

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

function createHttpRequestHandler() {
    return (request, response) => {
        if (request.url === "/healthz") {
            response.writeHead(200, {
                "Content-Type": "application/json",
            })
            response.end(JSON.stringify({ status: "ok" }))
            return
        }

        // Socket.IO handles its own transport paths on the shared HTTP server.
        if (request.url?.startsWith("/socket.io/")) {
            return
        }

        response.writeHead(404, {
            "Content-Type": "text/plain",
        })
        response.end("Not found")
    }
}

async function startServer() {
    await connectToDatabase()
    const allowedClientOrigins = getAllowedClientOrigins()

    const httpServer = http.createServer(createHttpRequestHandler())
    const io = new Server(httpServer, {
        cors: {
            origin: allowedClientOrigins,
            methods: ["GET", "POST"],
        },
    })
    const redisAdapter = await initializeRedisAdapter(io)

    registerSocketHandlers(io)
    registerGracefulShutdown(httpServer, redisAdapter.cleanup)

    httpServer.listen(PORT, () => {
        console.log(`Socket server listening on port ${PORT}`)
        console.log(`[Server] Allowed client origins: ${allowedClientOrigins.join(", ")}`)
    })
}

startServer().catch((error) => {
    console.error("Failed to start backend server", error)
    process.exit(1)
})
