function sendRouteError(response, error) {
    const statusCode = error.statusCode || 500

    if (statusCode >= 500) {
        console.error("[HTTP] Request failed", error)
    }

    response.status(statusCode).json({
        error: error.message || "Something went wrong.",
    })
}

function asyncRoute(handler) {
    return (request, response) => {
        Promise.resolve(handler(request, response)).catch((error) => {
            sendRouteError(response, error)
        })
    }
}

module.exports = {
    asyncRoute,
    sendRouteError,
}
