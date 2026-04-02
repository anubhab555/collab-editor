const { expect } = require("@playwright/test")

function uniqueDocumentId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

async function seedCollaborator(context, { clientId, displayName }) {
    await context.addInitScript(
        ({ nextClientId, nextDisplayName }) => {
            window.localStorage.setItem("collab-editor-client-id", nextClientId)
            window.localStorage.setItem("collab-editor-display-name", nextDisplayName)
        },
        {
            nextClientId: clientId,
            nextDisplayName: displayName,
        }
    )
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
    await page.keyboard.type(text)
}

async function waitForHistoryCount(page, count) {
    const items = page.locator("[data-testid^=\"history-item-\"]")

    await expect
        .poll(async () => items.count(), {
            timeout: 20000,
        })
        .toBe(count)
}

module.exports = {
    openDocument,
    replaceEditorText,
    seedCollaborator,
    uniqueDocumentId,
    waitForHistoryCount,
}
