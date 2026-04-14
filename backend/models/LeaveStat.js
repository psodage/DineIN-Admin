const mongoose = require("mongoose");

const leaveStatSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    // First day of the month this record belongs to
    month: {
      type: Date,
      required: true,
    },
    inactiveDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Day-wise classification inside this month.
    // These are date-only keys in the format "YYYY-MM-DD" (local date components).
    // - chargeableLeaveDayKeys: days that are part of a consecutive leave streak of length >= 5
    // - shortLeaveDayKeys: approved leave days that are part of shorter streaks (< 5)
    chargeableLeaveDayKeys: {
      type: [String],
      default: [],
    },
    shortLeaveDayKeys: {
      type: [String],
      default: [],
    },
    // Internal tracking for consecutive leave streak within this month
    lastLeaveDate: {
      type: Date,
    },
    currentStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Store in "leaves" collection as requested
module.exports = mongoose.model("LeaveStat", leaveStatSchema, "leaves");

