const { expect } = require("@playwright/test")

const DEFAULT_PASSWORD = "password123"

function uniqueDocumentId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function uniqueEmail(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@example.com`
}

async function registerUser(apiOrigin, { displayName, email, password = DEFAULT_PASSWORD }) {
    const response = await fetch(`${apiOrigin}/api/auth/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            displayName,
            email,
            password,
        }),
    })

    if (!response.ok) {
        const payload = await response.text()
        throw new Error(`Unable to register test user: ${payload}`)
    }

    return response.json()
}

async function seedSession(context, authPayload) {
    await context.addInitScript(
        ({ token, user }) => {
            window.localStorage.setItem("collab-editor-auth-token", token)
            window.localStorage.setItem("collab-editor-auth-user", JSON.stringify(user))
        },
        authPayload
    )
}

async function shareDocument(apiOrigin, documentId, ownerAuth, collaboratorEmail) {
    const response = await fetch(`${apiOrigin}/api/documents/${documentId}/share`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${ownerAuth.token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            email: collaboratorEmail,
        }),
    })

    if (!response.ok) {
        const payload = await response.text()
        throw new Error(`Unable to share test document: ${payload}`)
    }

    return response.json()
}

async function openDocument(page, origin, documentId) {
    await page.goto(`${origin}/documents/${documentId}`)
    const editor = page.locator(".ql-editor").first()

    await expect(editor).not.toContainText("Loading...")
    return editor
}

async function replaceEditorText(page, text) {
    const editor = page.locator(".ql-editor").first()

    await editor.click()
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Backspace")
    await page.keyboard.insertText(text)
}

async function waitForHistoryCount(page, count) {
    const items = page.locator("[data-testid^=\"history-item-\"]")

    await expect
        .poll(async () => items.count(), {
            timeout: 20000,
        })
        .toBe(count)
}

async function waitForPresenceCount(page, count) {
    const items = page.locator("[data-testid^=\"presence-item-\"]")

    await expect
        .poll(async () => items.count(), {
            timeout: 10000,
        })
        .toBe(count)
}

module.exports = {
    DEFAULT_PASSWORD,
    openDocument,
    registerUser,
    replaceEditorText,
    seedSession,
    shareDocument,
    uniqueDocumentId,
    uniqueEmail,
    waitForHistoryCount,
    waitForPresenceCount,
}
