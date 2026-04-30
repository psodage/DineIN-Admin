const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },

    // First day of the month (YYYY-MM-01) stored as a Date.
    month: { type: Date, required: true, index: true },

    // Money paid for that month (installments allowed).
    paidAmount: { type: Number, required: true, default: 0, min: 0 },

    paymentMethod: {
      type: String,
      enum: ["Cash", "UPI"],
      default: "Cash",
    },
    upiTransactionId: {
      type: String,
      trim: true,
      default: "",
    },

    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
