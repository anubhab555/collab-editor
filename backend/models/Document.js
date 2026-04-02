const { randomUUID } = require("crypto")
const { Schema, model } = require("mongoose")

const versionSchema = new Schema(
    {
        versionId: {
            type: String,
            default: () => randomUUID(),
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        savedBy: {
            clientId: {
                type: String,
                default: "guest",
            },
            displayName: {
                type: String,
                default: "Guest",
            },
        },
        source: {
            type: String,
            default: "checkpoint",
        },
        yjsState: {
            type: String,
            default: null,
        },
        data: {
            type: Schema.Types.Mixed,
            default: "",
        },
    },
    {
        _id: false,
    }
)

const documentSchema = new Schema(
    {
        _id: {
            type: String,
            required: true,
        },
        data: {
            type: Schema.Types.Mixed,
            default: "",
        },
        yjsState: {
            type: String,
            default: null,
        },
        contentFormat: {
            type: String,
            default: "quill-delta",
        },
        versions: {
            type: [versionSchema],
            default: [],
        },
    },
    {
        versionKey: false,
    }
)

module.exports = model("Document", documentSchema)
