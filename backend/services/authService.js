const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")

const User = require("../models/User")

const JWT_SECRET = process.env.JWT_SECRET || "collab-editor-dev-secret"
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d"
const MIN_PASSWORD_LENGTH = 8

class AuthServiceError extends Error {
    constructor(message, statusCode = 400) {
        super(message)
        this.name = "AuthServiceError"
        this.statusCode = statusCode
    }
}

function normalizeEmail(email) {
    return email?.trim().toLowerCase() || ""
}

function sanitizeUser(user) {
    if (!user) return null

    return {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
    }
}

function validateDisplayName(displayName) {
    const normalizedDisplayName = displayName?.trim() || ""

    if (normalizedDisplayName.length < 2) {
        throw new AuthServiceError("Display name must be at least 2 characters long.")
    }

    return normalizedDisplayName
}

function validateEmail(email) {
    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
        throw new AuthServiceError("Please enter a valid email address.")
    }

    return normalizedEmail
}

function validatePassword(password) {
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
        throw new AuthServiceError(
            `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
        )
    }

    return password
}

function signTokenForUser(user) {
    return jwt.sign(
        {
            displayName: user.displayName,
            email: user.email,
        },
        JWT_SECRET,
        {
            expiresIn: JWT_EXPIRES_IN,
            subject: user._id,
        }
    )
}

async function buildAuthPayload(user) {
    return {
        token: signTokenForUser(user),
        user: sanitizeUser(user),
    }
}

async function registerUser({ displayName, email, password } = {}) {
    const normalizedDisplayName = validateDisplayName(displayName)
    const normalizedEmail = validateEmail(email)
    const normalizedPassword = validatePassword(password)

    const existingUser = await User.findOne({ email: normalizedEmail })
    if (existingUser) {
        throw new AuthServiceError("An account already exists for that email.", 409)
    }

    const passwordHash = await bcrypt.hash(normalizedPassword, 10)
    const user = await User.create({
        displayName: normalizedDisplayName,
        email: normalizedEmail,
        passwordHash,
    })

    return buildAuthPayload(user)
}

async function loginUser({ email, password } = {}) {
    const normalizedEmail = validateEmail(email)
    const normalizedPassword = validatePassword(password)

    const user = await User.findOne({ email: normalizedEmail })
    if (!user) {
        throw new AuthServiceError("Invalid email or password.", 401)
    }

    const passwordMatches = await bcrypt.compare(normalizedPassword, user.passwordHash)
    if (!passwordMatches) {
        throw new AuthServiceError("Invalid email or password.", 401)
    }

    return buildAuthPayload(user)
}

function verifyToken(token) {
    if (!token) {
        throw new AuthServiceError("Authentication required.", 401)
    }

    try {
        return jwt.verify(token, JWT_SECRET)
    } catch (error) {
        throw new AuthServiceError("Authentication required.", 401)
    }
}

async function getAuthenticatedUserFromToken(token) {
    const payload = verifyToken(token)
    const user = await User.findById(payload.sub)

    if (!user) {
        throw new AuthServiceError("Authentication required.", 401)
    }

    return sanitizeUser(user)
}

async function findUserByEmail(email) {
    const normalizedEmail = validateEmail(email)
    const user = await User.findOne({ email: normalizedEmail })

    if (!user) {
        throw new AuthServiceError("No user exists for that email address.", 404)
    }

    return sanitizeUser(user)
}

module.exports = {
    AuthServiceError,
    buildAuthPayload,
    findUserByEmail,
    getAuthenticatedUserFromToken,
    loginUser,
    normalizeEmail,
    registerUser,
    sanitizeUser,
}
