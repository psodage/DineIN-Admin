const mongoose = require("mongoose");

const snackOrderSchema = new mongoose.Schema(
  {
    // When linked to a hostel member, this references Member.
    // For outside customers, this will be null/undefined.
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: false,
      index: true,
    },

    // For outside customers only (store customer name here).
    // For member orders, keep this empty to avoid duplication.
    customerName: {
      type: String,
      trim: true,
      required: false,
    },
    // Marathi customer name (optional; fallback to `customerName`)
    customerNameMr: { type: String, trim: true, default: "" },

    // Snack product master data reference.
    snackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SnackProduct",
      required: false,
      index: true,
    },
    // Snapshot fields for manual snack entry when snackId is not used.
    snackItemSnapshot: { type: String, trim: true, default: "" },
    snackItemMrSnapshot: { type: String, trim: true, default: "" },
    pricePerItemSnapshot: { type: Number, min: 0, default: null },

    quantity: { type: Number, required: true, min: 1 },
    // Optional billed amount override (used for bill-split allocations).
    // When null, amount is derived from snack.price * quantity.
    chargedAmount: { type: Number, default: null, min: 0 },

    date: { type: Date, required: true, default: Date.now, index: true },

    // true => order created for outside customer (not billed to hostel student)
    isOutsideCustomer: { type: Boolean, default: false, index: true },

    // Used for snack bill split flow:
    // - when a bill split completes or fails, we can delete/collect these orders.
    billSplitRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillSplitRequest",
      required: false,
      index: true,
    },

    // Shared order id across all rows created from one split request.
    commonOrderId: { type: String, trim: true, default: "", index: true },
    // Snapshot of all members involved in a split order.
    // Empty for regular non-split orders.
    splitMemberIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Member", index: true },
    ],

    /** Same as `_id` string; set on create for exports / UI (insertMany skips save hooks). */
    purchaseReference: { type: String, trim: true, default: "", index: true },
  },
  { timestamps: true }
);

snackOrderSchema.pre("save", function (next) {
  if (!this.purchaseReference && this._id) {
    this.purchaseReference = String(this._id);
  }
  next();
});

module.exports = mongoose.model("SnackOrder", snackOrderSchema);

