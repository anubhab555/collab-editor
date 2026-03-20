const mongoose = require("mongoose")

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/collab-editor"

let connectionPromise

function connectToDatabase() {
    if (!connectionPromise) {
        connectionPromise = mongoose.connect(MONGODB_URI)
    }

    return connectionPromise
}

module.exports = connectToDatabase
