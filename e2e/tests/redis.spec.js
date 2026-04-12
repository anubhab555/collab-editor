const { test, expect } = require("@playwright/test")

const {
    openDocument,
    replaceEditorText,
    registerUser,
    seedSession,
    shareDocument,
    uniqueDocumentId,
    uniqueEmail,
    waitForHistoryCount,
    waitForPresenceCount,
} = require("./helpers")

test("redis-backed collaboration syncs history and restore across backend instances", async ({ browser }) => {
    const documentId = uniqueDocumentId("redis")
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const authA = await registerUser("http://127.0.0.1:3001", {
        displayName: "Alice",
        email: uniqueEmail("redis-alice"),
    })
    const authB = await registerUser("http://127.0.0.1:3001", {
        displayName: "Bob",
        email: uniqueEmail("redis-bob"),
    })

    await shareDocument("http://127.0.0.1:3001", documentId, authA, authB.user.email)

    await seedSession(contextA, authA)
    await seedSession(contextB, authB)

    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()
    const editorA = await openDocument(pageA, "http://127.0.0.1:3000", documentId)
    const editorB = await openDocument(pageB, "http://127.0.0.1:3003", documentId)

    await waitForPresenceCount(pageA, 2)
    await waitForPresenceCount(pageB, 2)
    await expect(pageA.getByTestId(`presence-item-${authA.user.id}`)).toBeVisible()
    await expect(pageA.getByTestId(`presence-item-${authB.user.id}`)).toBeVisible()
    await expect(pageB.getByTestId(`presence-item-${authA.user.id}`)).toBeVisible()
    await expect(pageB.getByTestId(`presence-item-${authB.user.id}`)).toBeVisible()

    await replaceEditorText(pageA, "Redis version one")
    await expect(editorB).toContainText("Redis version one")
    await expect(pageB.locator(".remote-cursor__label", { hasText: "Alice" })).toBeVisible()
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
    await waitForPresenceCount(pageB, 1)
    await expect(pageB.getByTestId(`presence-item-${authB.user.id}`)).toBeVisible()
    await expect(pageB.locator(`[data-testid="presence-item-${authA.user.id}"]`)).toHaveCount(0)
    await contextB.close()
})
