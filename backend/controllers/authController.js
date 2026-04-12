const {
    loginUser,
    registerUser,
} = require("../services/authService")

async function register(payload) {
    return registerUser(payload)
}

async function login(payload) {
    return loginUser(payload)
}

async function getCurrentUser(user) {
    return {
        user,
    }
}

module.exports = {
    getCurrentUser,
    login,
    register,
}
