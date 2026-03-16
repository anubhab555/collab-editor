const { Schema, model } = require("mongoose")

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
    },
    {
        versionKey: false,
    }
)

module.exports = model("Document", documentSchema)
