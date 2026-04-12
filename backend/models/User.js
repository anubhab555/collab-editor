const { randomUUID } = require("crypto")
const { Schema, model } = require("mongoose")

const userSchema = new Schema(
    {
        _id: {
            type: String,
            default: () => randomUUID(),
        },
        displayName: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            unique: true,
        },
        passwordHash: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
)

module.exports = model("User", userSchema)
