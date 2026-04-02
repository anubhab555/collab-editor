const { test, expect } = require("@playwright/test")

const {
    openDocument,
    replaceEditorText,
    seedCollaborator,
    uniqueDocumentId,
    waitForHistoryCount,
} = require("./helpers")

test("redis-backed collaboration syncs history and restore across backend instances", async ({ browser }) => {
    const documentId = uniqueDocumentId("redis")
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()

    await seedCollaborator(contextA, {
        clientId: "redis-user-a",
        displayName: "Alice",
    })
    await seedCollaborator(contextB, {
        clientId: "redis-user-b",
        displayName: "Bob",
    })

    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()
    const editorA = await openDocument(pageA, "http://127.0.0.1:3000", documentId)
    const editorB = await openDocument(pageB, "http://127.0.0.1:3003", documentId)

    await replaceEditorText(pageA, "Redis version one")
    await expect(editorB).toContainText("Redis version one")
    await waitForHistoryCount(pageA, 1)
    await waitForHistoryCount(pageB, 1)

    await replaceEditorText(pageB, "Redis version two")
    await expect(editorA).toContainText("Redis version two")
    await waitForHistoryCount(pageA, 2)
    await waitForHistoryCount(pageB, 2)

    const restoreButton = pageB.locator("[data-testid^=\"history-restore-\"]").nth(1)
    pageB.once("dialog", (dialog) => {
        void dialog.accept()
    })
    await restoreButton.click({ force: true })

    await expect(editorA).toContainText("Redis version one")
    await expect(editorB).toContainText("Redis version one")
    await waitForHistoryCount(pageA, 3)
    await waitForHistoryCount(pageB, 3)

    await contextA.close()
    await contextB.close()
})
