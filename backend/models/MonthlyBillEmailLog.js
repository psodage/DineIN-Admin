const mongoose = require("mongoose");

const monthlyBillEmailLogSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
    monthKey: { type: String, required: true }, // e.g. "2026-02"
    to: { type: String, required: true },
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    due: { type: Number, default: 0 },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

monthlyBillEmailLogSchema.index({ memberId: 1, monthKey: 1 }, { unique: true });

module.exports = mongoose.model("MonthlyBillEmailLog", monthlyBillEmailLogSchema);

