function uint8ArrayToBase64(bytes) {
    if (!bytes || bytes.byteLength === 0) return ""

    let binary = ""
    const chunkSize = 0x8000

    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize)
        binary += String.fromCharCode(...chunk)
    }

    return window.btoa(binary)
}

function base64ToUint8Array(base64) {
    if (!base64) return new Uint8Array(0)

    const binary = window.atob(base64)
    const bytes = new Uint8Array(binary.length)

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
    }

    return bytes
}

function encodeBinaryValues(value) {
    if (value instanceof Uint8Array) {
        return {
            __binaryBase64: uint8ArrayToBase64(value),
        }
    }

    if (ArrayBuffer.isView(value)) {
        return {
            __binaryBase64: uint8ArrayToBase64(new Uint8Array(
                value.buffer,
                value.byteOffset,
                value.byteLength
            )),
        }
    }

    if (value instanceof ArrayBuffer) {
        return {
            __binaryBase64: uint8ArrayToBase64(new Uint8Array(value)),
        }
    }

    if (Array.isArray(value)) {
        return value.map(encodeBinaryValues)
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, nextValue]) => [key, encodeBinaryValues(nextValue)])
        )
    }

    return value
}

function decodeBinaryValues(value) {
    if (Array.isArray(value)) {
        return value.map(decodeBinaryValues)
    }

    if (value && typeof value === "object") {
        if (typeof value.__binaryBase64 === "string") {
            return base64ToUint8Array(value.__binaryBase64)
        }

        return Object.fromEntries(
            Object.entries(value).map(([key, nextValue]) => [key, decodeBinaryValues(nextValue)])
        )
    }

    return value
}

function getRealtimeUrl(baseUrl, token) {
    const fallbackOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3001"
    const normalizedBaseUrl = baseUrl || fallbackOrigin
    const wsBaseUrl = normalizedBaseUrl
        .replace(/^http:\/\//, "ws://")
        .replace(/^https:\/\//, "wss://")
        .replace(/\/$/, "")
    const url = new URL(`${wsBaseUrl}/ws`)

    url.searchParams.set("token", token)
    return url.toString()
}

export default class RealtimeClient {
    constructor(baseUrl, { token }) {
        this.baseUrl = baseUrl
        this.handlers = new Map()
        this.id = null
        this.socket = new WebSocket(getRealtimeUrl(baseUrl, token))

        this.socket.addEventListener("message", (event) => {
            const message = JSON.parse(event.data)
            const payload = decodeBinaryValues(message.payload)

            if (message.event === "connected") {
                this.id = payload.sessionId
            }

            this.dispatch(message.event, payload)
        })

        this.socket.addEventListener("error", () => {
            this.dispatch("connect_error", new Error("Unable to connect to the Java WebSocket backend."))
        })

        this.socket.addEventListener("close", (event) => {
            if (event.code !== 1000) {
                this.dispatch("connect_error", new Error(event.reason || "WebSocket connection closed."))
            }
        })
    }

    disconnect() {
        this.socket.close(1000, "client disconnect")
    }

    emit(event, payload = {}) {
        const send = () => {
            this.socket.send(JSON.stringify({
                event,
                payload: encodeBinaryValues(payload),
            }))
        }

        if (this.socket.readyState === WebSocket.OPEN) {
            send()
            return
        }

        this.socket.addEventListener("open", send, { once: true })
    }

    off(event, handler) {
        const eventHandlers = this.handlers.get(event)
        if (!eventHandlers) return

        eventHandlers.delete(handler)
    }

    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set())
        }

        this.handlers.get(event).add(handler)
    }

    once(event, handler) {
        const wrappedHandler = (payload) => {
            this.off(event, wrappedHandler)
            handler(payload)
        }

        this.on(event, wrappedHandler)
    }

    dispatch(event, payload) {
        for (const handler of this.handlers.get(event) || []) {
            handler(payload)
        }
    }
}
