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

const collaboratorSchema = new Schema(
    {
        userId: {
            type: String,
            required: true,
        },
        displayName: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
        },
        role: {
            type: String,
            default: "editor",
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
        title: {
            type: String,
            default: "Untitled document",
            trim: true,
        },
        ownerId: {
            type: String,
            default: null,
        },
        ownerDisplayName: {
            type: String,
            default: null,
        },
        ownerEmail: {
            type: String,
            default: null,
        },
        collaborators: {
            type: [collaboratorSchema],
            default: [],
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
        timestamps: true,
        versionKey: false,
    }
)

module.exports = model("Document", documentSchema)
