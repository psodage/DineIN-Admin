const mongoose = require("mongoose");

const billSplitAllocationSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    // Allocated snack items for this member.
    items: [
      {
        snackId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "SnackProduct",
          required: true,
          index: true,
        },
        quantity: { type: Number, required: true, min: 0 },
        // Snapshot unit price at split-request time for stable "your share".
        unitPrice: { type: Number, min: 0, default: 0 },
      },
    ],
    // Exact split amount for this member at request creation time.
    allocatedAmount: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
      index: true,
    },
    approvedAt: { type: Date },
  },
  { _id: false }
);

const billSplitRequestSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },

    // Used for billing month (snack orders use this date).
    orderDate: { type: Date, default: Date.now, index: true },

    // Original order items (snackId + quantity).
    orderItems: [
      {
        snackId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "SnackProduct",
          required: true,
        },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],

    // All participants including createdBy.
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Member", index: true },
    ],

    allocations: [billSplitAllocationSchema],

    status: {
      type: String,
      enum: ["Active", "Completed", "Failed"],
      default: "Active",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BillSplitRequest", billSplitRequestSchema);

