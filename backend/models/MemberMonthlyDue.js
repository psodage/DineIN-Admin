const mongoose = require("mongoose");

const memberMonthlyDueSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    month: {
      type: Date,
      required: true,
      index: true,
    },
    due: {
      type: Number,
      default: 0,
      min: 0,
    },
    collected: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["Pending", "Paid"],
      default: "Pending",
      index: true,
    },
    lastChargedDate: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
);

module.exports = mongoose.model(
  "MemberMonthlyDue",
  memberMonthlyDueSchema,
  "member_monthly_due"
);
