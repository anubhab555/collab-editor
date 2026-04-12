const express = require("express")

const authController = require("../controllers/authController")
const { authenticateHttp } = require("../middleware/authMiddleware")
const { asyncRoute } = require("../utils/routeUtils")

const router = express.Router()

router.post("/register", asyncRoute(async (request, response) => {
    const result = await authController.register(request.body)
    response.status(201).json(result)
}))

router.post("/login", asyncRoute(async (request, response) => {
    const result = await authController.login(request.body)
    response.json(result)
}))

router.get("/me", authenticateHttp, asyncRoute(async (request, response) => {
    const result = await authController.getCurrentUser(request.user)
    response.json(result)
}))

module.exports = router
