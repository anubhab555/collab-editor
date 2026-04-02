const { test, expect } = require("@playwright/test")

const {
    openDocument,
    replaceEditorText,
    seedCollaborator,
    uniqueDocumentId,
    waitForHistoryCount,
    waitForPresenceCount,
} = require("./helpers")

test("single-node multi-context collaboration and restore smoke", async ({ browser }) => {
    const documentId = uniqueDocumentId("single-node")
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()

    await seedCollaborator(contextA, {
        clientId: "single-user-a",
        displayName: "Alice",
    })
    await seedCollaborator(contextB, {
        clientId: "single-user-b",
        displayName: "Bob",
    })

    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()
    const editorA = await openDocument(pageA, "http://127.0.0.1:3000", documentId)
    const editorB = await openDocument(pageB, "http://127.0.0.1:3000", documentId)

    await waitForPresenceCount(pageA, 2)
    await waitForPresenceCount(pageB, 2)
    await expect(pageA.getByTestId("presence-item-single-user-a")).toBeVisible()
    await expect(pageA.getByTestId("presence-item-single-user-b")).toBeVisible()
    await expect(pageB.getByTestId("presence-item-single-user-a")).toBeVisible()
    await expect(pageB.getByTestId("presence-item-single-user-b")).toBeVisible()

    await replaceEditorText(pageA, "Version one")
    await expect(editorB).toContainText("Version one")
    await expect(pageB.locator(".remote-cursor__label", { hasText: "Alice" })).toBeVisible()
    await waitForHistoryCount(pageA, 1)
    await waitForHistoryCount(pageB, 1)

    await replaceEditorText(pageA, "Version two")
    await expect(editorB).toContainText("Version two")
    await waitForHistoryCount(pageA, 2)
    await waitForHistoryCount(pageB, 2)

    const restoreButton = pageA.locator("[data-testid^=\"history-restore-\"]").nth(1)
    pageA.once("dialog", (dialog) => {
        void dialog.accept()
    })
    await restoreButton.click({ force: true })

    await expect(editorA).toContainText("Version one")
    await expect(editorB).toContainText("Version one")
    await waitForHistoryCount(pageA, 3)
    await waitForHistoryCount(pageB, 3)

    await contextA.close()
    await waitForPresenceCount(pageB, 1)
    await expect(pageB.getByTestId("presence-item-single-user-b")).toBeVisible()
    await expect(pageB.locator("[data-testid=\"presence-item-single-user-a\"]")).toHaveCount(0)
    await contextB.close()
})
