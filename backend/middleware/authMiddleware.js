const {
    AuthServiceError,
    getAuthenticatedUserFromToken,
} = require("../services/authService")

function getBearerToken(value) {
    if (typeof value !== "string") return null
    if (!value.startsWith("Bearer ")) return null

    return value.slice("Bearer ".length).trim()
}

function getRequestToken(request) {
    return getBearerToken(request.headers.authorization)
}

function getSocketToken(socket) {
    if (typeof socket.handshake.auth?.token === "string") {
        return socket.handshake.auth.token.trim()
    }

    return getBearerToken(socket.handshake.headers.authorization)
}

function sendAuthError(response, error) {
    const statusCode = error instanceof AuthServiceError ? error.statusCode : 401

    response.status(statusCode).json({
        error: error.message || "Authentication required.",
    })
}

async function authenticateHttp(request, response, next) {
    try {
        request.user = await getAuthenticatedUserFromToken(getRequestToken(request))
        next()
    } catch (error) {
        sendAuthError(response, error)
    }
}

function createSocketAuthMiddleware() {
    return async (socket, next) => {
        try {
            socket.data.authUser = await getAuthenticatedUserFromToken(getSocketToken(socket))
            next()
        } catch (error) {
            const authError = new Error(error.message || "Authentication required.")
            authError.data = {
                statusCode: error.statusCode || 401,
            }

            next(authError)
        }
    }
}

module.exports = {
    authenticateHttp,
    createSocketAuthMiddleware,
    getBearerToken,
}
