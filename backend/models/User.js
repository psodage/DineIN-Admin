const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["admin", "member"],
    default: "admin",
  },

  // Single active session token for members/admins.
  activeSessionToken: { type: String, default: null },

  resetToken: { type: String },
  resetTokenExpiry: { type: Date },
},
{ timestamps: true });

module.exports = mongoose.model("User", userSchema);