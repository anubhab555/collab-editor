const express = require("express")

const documentController = require("../controllers/documentController")
const { asyncRoute } = require("../utils/routeUtils")

const router = express.Router()

router.get("/", asyncRoute(async (request, response) => {
    const result = await documentController.listDocuments(request.user)
    response.json(result)
}))

router.post("/", asyncRoute(async (request, response) => {
    const result = await documentController.createDocument(request.body, request.user)
    response.status(201).json(result)
}))

router.get("/:documentId", asyncRoute(async (request, response) => {
    const result = await documentController.getDocumentMetadata(
        request.params.documentId,
        request.user
    )
    response.json(result)
}))

router.post("/:documentId/share", asyncRoute(async (request, response) => {
    const result = await documentController.shareDocument(
        request.params.documentId,
        request.body,
        request.user
    )
    response.json(result)
}))

module.exports = router
