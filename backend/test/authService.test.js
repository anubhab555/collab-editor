const test = require("node:test")
const assert = require("node:assert/strict")
const bcrypt = require("bcryptjs")

const User = require("../models/User")
const {
    getAuthenticatedUserFromToken,
    loginUser,
    registerUser,
} = require("../services/authService")

function createFakeUser(payload = {}) {
    return {
        _id: payload._id || "user-1",
        displayName: payload.displayName || "Anubhab",
        email: payload.email || "anubhab@example.com",
        passwordHash: payload.passwordHash,
    }
}

test("registerUser creates an account and returns an auth payload", async (context) => {
    const originalFindOne = User.findOne
    const originalCreate = User.create

    User.findOne = async () => null
    User.create = async (payload) => createFakeUser({
        _id: "user-1",
        ...payload,
    })

    context.after(() => {
        User.findOne = originalFindOne
        User.create = originalCreate
    })

    const result = await registerUser({
        displayName: "Anubhab",
        email: "anubhab@example.com",
        password: "password123",
    })

    assert.ok(result.token)
    assert.equal(result.user.displayName, "Anubhab")
    assert.equal(result.user.email, "anubhab@example.com")
})

test("loginUser and getAuthenticatedUserFromToken validate an existing account", async (context) => {
    const originalFindOne = User.findOne
    const originalFindById = User.findById
    const passwordHash = await bcrypt.hash("password123", 10)

    const seededUser = createFakeUser({
        _id: "user-2",
        displayName: "Collaborator",
        email: "collaborator@example.com",
        passwordHash,
    })

    User.findOne = async () => seededUser
    User.findById = async () => seededUser

    context.after(() => {
        User.findOne = originalFindOne
        User.findById = originalFindById
    })

    const loginResult = await loginUser({
        email: "collaborator@example.com",
        password: "password123",
    })

    const authenticatedUser = await getAuthenticatedUserFromToken(loginResult.token)

    assert.equal(authenticatedUser.id, "user-2")
    assert.equal(authenticatedUser.displayName, "Collaborator")
})
