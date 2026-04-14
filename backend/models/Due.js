const mongoose = require("mongoose");

// This collection is kept only for compatibility; due amounts are now computed
// dynamically from Payment + SnackOrder + LeaveStat + Expense.
const dueSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },

    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Due", dueSchema, "dues");

