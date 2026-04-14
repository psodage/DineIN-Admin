const mongoose = require("mongoose");

const menuSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  pollOptionKey: {
    type: String,
    trim: true,
    lowercase: true,
    default: "",
  },
  pollOptionLabel: {
    type: String,
    trim: true,
    default: "",
  },
  pollOptionLabelMr: {
    type: String,
    trim: true,
    default: "",
  },
  breakfast: {
    type: String,
    required: false,
    default: "",
  },
  lunch: {
    type: String,
    required: false,
    default: "",
  },
  lunchMr: {
    type: String,
    default: "",
  },
  dinner: {
    type: String,
    required: false,
    default: "",
  },
  dinnerMr: {
    type: String,
    default: "",
  },
}, { timestamps: true });

// Index for fast date lookups
menuSchema.index({ date: 1 });
menuSchema.index({ date: 1, pollOptionKey: 1 });

module.exports = mongoose.model("Menu", menuSchema);
