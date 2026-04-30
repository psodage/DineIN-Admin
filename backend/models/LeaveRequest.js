const mongoose = require("mongoose");

const leaveRequestSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    // Optional type of request, e.g. "Leave" or "Activation"
    type: {
      type: String,
      enum: ["Leave", "Activation"],
      default: "Leave",
    },
    startDate: {
      type: Date,
      required: function requiredStartDate() {
        return this.type === "Leave";
      },
      default: null,
    },
    endDate: {
      type: Date,
      required: function requiredEndDate() {
        return this.type === "Activation";
      },
      default: null,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    source: {
      type: String,
      enum: ["Request", "CalendarEdit"],
      default: "Request",
      index: true,
    },
    isOngoing: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Billing bookkeeping: we only add to LeaveStat.inactiveDays when a Leave
    // request duration is >= 5 days. This prevents double counting.
    billingApplied: {
      type: Boolean,
      default: false,
      index: true,
    },
    billingDaysTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    billingDaysByMonth: [
      {
        month: { type: Date, required: true },
        days: { type: Number, required: true, min: 0 },
      },
    ],
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

module.exports = mongoose.model("LeaveRequest", leaveRequestSchema);

