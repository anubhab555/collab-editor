class ApiError extends Error {
    constructor(message, statusCode, payload) {
        super(message)
        this.name = "ApiError"
        this.statusCode = statusCode
        this.payload = payload
    }
}

function getApiBaseUrl() {
    if (process.env.REACT_APP_API_URL) {
        return process.env.REACT_APP_API_URL
    }

    if (process.env.NODE_ENV === "development") {
        return "http://localhost:3001/api"
    }

    if (typeof window !== "undefined") {
        return `${window.location.origin}/api`
    }

    return "http://localhost:3001/api"
}

const API_BASE_URL = getApiBaseUrl()

async function apiRequest(path, { body, method = "GET", token } = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    })

    const contentType = response.headers.get("content-type") || ""
    const payload = contentType.includes("application/json")
        ? await response.json()
        : null

    if (!response.ok) {
        throw new ApiError(
            payload?.error || "Request failed.",
            response.status,
            payload
        )
    }

    return payload
}

export {
    API_BASE_URL,
    ApiError,
    apiRequest,
}
