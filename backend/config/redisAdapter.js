const { createAdapter } = require("@socket.io/redis-adapter")
const { createClient } = require("redis")

const REDIS_URL = process.env.REDIS_URL
const MAX_REDIS_RETRIES = 20

function getReconnectDelay(retries) {
    return Math.min(retries * 50, 2000)
}

function createReconnectStrategy(clientName) {
    return (retries, cause) => {
        const retryDelay = getReconnectDelay(retries)

        if (retries > MAX_REDIS_RETRIES) {
            return new Error(
                `[Redis] ${clientName} connection failed after ${MAX_REDIS_RETRIES} retries: ${cause.message}`
            )
        }

        console.warn(
            `[Redis] ${clientName} reconnect attempt ${retries} in ${retryDelay}ms`
        )

        return retryDelay
    }
}

function attachErrorLogging(client, clientName) {
    client.on("error", (error) => {
        console.error(`[Redis] ${clientName} client error`, error)
    })
}

async function closeClient(client) {
    if (!client?.isOpen) return

    try {
        await client.quit()
    } catch (error) {
        console.error("[Redis] Failed to quit client cleanly", error)
        client.destroy()
    }
}

async function initializeRedisAdapter(io) {
    if (!REDIS_URL) {
        console.log("[Redis] Running in single-node mode")

        return {
            enabled: false,
            cleanup: async () => {},
        }
    }

    const pubClient = createClient({
        url: REDIS_URL,
        socket: {
            reconnectStrategy: createReconnectStrategy("pub"),
        },
    })
    const subClient = pubClient.duplicate({
        socket: {
            reconnectStrategy: createReconnectStrategy("sub"),
        },
    })

    attachErrorLogging(pubClient, "pub")
    attachErrorLogging(subClient, "sub")

    await Promise.all([pubClient.connect(), subClient.connect()])
    console.log("[Redis] Connected to pub/sub")

    io.adapter(createAdapter(pubClient, subClient))
    console.log("[Redis] Adapter enabled")

    return {
        enabled: true,
        cleanup: async () => {
            await Promise.allSettled([closeClient(pubClient), closeClient(subClient)])
        },
    }
}

module.exports = initializeRedisAdapter
