const http = require("http")
const express = require("express")
const { Server } = require("socket.io")

const connectToDatabase = require("./config/db")
const { authenticateHttp, createSocketAuthMiddleware } = require("./middleware/authMiddleware")
const initializeRedisAdapter = require("./config/redisAdapter")
const authRoutes = require("./routes/authRoutes")
const documentRoutes = require("./routes/documentRoutes")
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

function createCorsMiddleware(allowedOrigins) {
    const allowedOriginSet = new Set(allowedOrigins)

    return (request, response, next) => {
        const origin = request.headers.origin

        if (origin && allowedOriginSet.has(origin)) {
            response.setHeader("Access-Control-Allow-Origin", origin)
            response.setHeader("Vary", "Origin")
            response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type")
            response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        }

        if (request.method === "OPTIONS") {
            response.status(204).end()
            return
        }

        next()
    }
}

function createHttpApplication(allowedOrigins) {
    const app = express()

    app.use(createCorsMiddleware(allowedOrigins))
    app.use(express.json())

    app.get("/healthz", (request, response) => {
        response.status(200).json({ status: "ok" })
    })

    app.use("/api/auth", authRoutes)
    app.use("/api/documents", authenticateHttp, documentRoutes)

    app.use((request, response) => {
        response.status(404).json({
            error: "Not found",
        })
    })

    return app
}

async function startServer() {
    await connectToDatabase()
    const allowedClientOrigins = getAllowedClientOrigins()

    const httpApplication = createHttpApplication(allowedClientOrigins)
    const httpServer = http.createServer(httpApplication)
    const io = new Server(httpServer, {
        cors: {
            origin: allowedClientOrigins,
            methods: ["GET", "POST"],
        },
    })
    const redisAdapter = await initializeRedisAdapter(io)

    io.use(createSocketAuthMiddleware())
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
