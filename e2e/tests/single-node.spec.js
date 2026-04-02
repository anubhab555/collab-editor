const { test, expect } = require("@playwright/test")

const {
    openDocument,
    replaceEditorText,
    seedCollaborator,
    uniqueDocumentId,
    waitForHistoryCount,
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

    await replaceEditorText(pageA, "Version one")
    await expect(editorB).toContainText("Version one")
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
    await contextB.close()
})
