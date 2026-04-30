const mongoose = require("mongoose");

const appSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    numberValue: {
      type: Number,
      default: null,
    },
    stringValue: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("AppSetting", appSettingSchema);
