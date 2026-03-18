function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
}

function hashString(value) {
    let hash = 0

    for (let index = 0; index < value.length; index += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(index)
        hash |= 0
    }

    return Math.abs(hash)
}

function normalizeNumericValue(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback
}

export default class CursorManager {
    constructor(quill) {
        this.quill = quill
        this.cursors = new Map()
        this.frameId = null
        this.isDestroyed = false
        this.scheduleRender = this.scheduleRender.bind(this)
        this.handleWindowScroll = this.scheduleRender.bind(this)
        this.handleResize = this.scheduleRender.bind(this)
        this.handleEditorScroll = this.scheduleRender.bind(this)

        this.overlayEl = document.createElement("div")
        this.overlayEl.className = "remote-cursor-layer"
        this.quill.container.append(this.overlayEl)

        window.addEventListener("scroll", this.handleWindowScroll, true)
        window.addEventListener("resize", this.handleResize)
        this.quill.root.addEventListener("scroll", this.handleEditorScroll)
    }

    upsertCursor(user, range) {
        if (!user?.clientId || this.isDestroyed) return

        const normalizedRange = this.normalizeRange(range)
        const existingCursor = this.cursors.get(user.clientId)

        if (existingCursor) {
            existingCursor.user = user
            existingCursor.range = normalizedRange
            this.updateMarker(existingCursor.markerEl, user)
        } else {
            const markerEl = this.createMarker(user)
            this.cursors.set(user.clientId, {
                user,
                range: normalizedRange,
                markerEl,
            })
        }

        this.scheduleRender()
    }

    removeCursor(clientId) {
        if (!clientId) return

        const existingCursor = this.cursors.get(clientId)
        if (!existingCursor) return

        existingCursor.markerEl.remove()
        this.cursors.delete(clientId)
    }

    clearAll() {
        for (const cursor of this.cursors.values()) {
            cursor.markerEl.remove()
        }

        this.cursors.clear()
    }

    transformCursors(delta) {
        if (!delta || typeof delta.transformPosition !== "function") return

        for (const cursor of this.cursors.values()) {
            if (!cursor.range) continue

            const start = delta.transformPosition(cursor.range.index, false)
            const end = delta.transformPosition(
                cursor.range.index + cursor.range.length,
                false
            )

            cursor.range = this.normalizeRange({
                index: start,
                length: Math.max(0, end - start),
            })
        }
    }

    scheduleRender() {
        if (this.isDestroyed || this.frameId != null) return

        this.frameId = window.requestAnimationFrame(() => {
            this.frameId = null
            this.render()
        })
    }

    destroy() {
        if (this.isDestroyed) return

        this.isDestroyed = true

        if (this.frameId != null) {
            window.cancelAnimationFrame(this.frameId)
            this.frameId = null
        }

        window.removeEventListener("scroll", this.handleWindowScroll, true)
        window.removeEventListener("resize", this.handleResize)
        this.quill.root.removeEventListener("scroll", this.handleEditorScroll)

        this.clearAll()
        this.overlayEl.remove()
    }

    normalizeRange(range) {
        if (!range) return null

        const documentLength = Math.max(1, this.quill.getLength())
        const maxIndex = documentLength - 1
        const rawIndex = normalizeNumericValue(range.index)
        const rawLength = Math.max(0, normalizeNumericValue(range.length))
        const index = clamp(rawIndex, 0, maxIndex)
        const end = clamp(index + rawLength, index, maxIndex)

        return {
            index,
            length: end - index,
        }
    }

    createMarker(user) {
        const markerEl = document.createElement("div")
        const caretEl = document.createElement("div")
        const labelEl = document.createElement("div")

        markerEl.className = "remote-cursor"
        markerEl.dataset.clientId = user.clientId
        caretEl.className = "remote-cursor__caret"
        labelEl.className = "remote-cursor__label"

        markerEl.append(caretEl, labelEl)
        this.updateMarker(markerEl, user)
        this.overlayEl.append(markerEl)

        return markerEl
    }

    updateMarker(markerEl, user) {
        markerEl.style.setProperty("--cursor-color", user.color)
        markerEl.style.zIndex = String(10 + (hashString(user.clientId) % 90))

        const labelEl = markerEl.querySelector(".remote-cursor__label")
        if (labelEl) {
            labelEl.textContent = user.displayName
        }
    }

    render() {
        if (this.isDestroyed) return

        const activeCursorIds = new Set(this.cursors.keys())

        for (const child of Array.from(this.overlayEl.children)) {
            if (!activeCursorIds.has(child.dataset.clientId)) {
                child.remove()
            }
        }

        let needsRetry = false

        for (const cursor of this.cursors.values()) {
            if (!cursor.markerEl.isConnected) {
                this.overlayEl.append(cursor.markerEl)
            }

            if (!cursor.range) {
                cursor.markerEl.hidden = true
                continue
            }

            const bounds = this.quill.getBounds(cursor.range.index, cursor.range.length)

            if (!bounds) {
                cursor.markerEl.hidden = true
                needsRetry = true
                continue
            }

            const height = Math.max(18, Math.round(bounds.height || 0))

            cursor.markerEl.hidden = false
            cursor.markerEl.style.setProperty("--cursor-height", `${height}px`)
            cursor.markerEl.style.transform = `translate(${Math.round(bounds.left)}px, ${Math.round(bounds.top)}px)`
        }

        if (needsRetry && this.cursors.size > 0) {
            this.scheduleRender()
        }
    }
}
