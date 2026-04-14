const mongoose = require("mongoose");

const snackSchema = new mongoose.Schema(
  {
    // When linked to a hostel member, this references Member.
    // For outside customers, this will be null/undefined.
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: false,
    },
    // Used for both students and outside customers (as display name).
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    snackItem: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    pricePerItem: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    // true => order created for outside customer (not billed to hostel student)
    isOutsideCustomer: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Snack", snackSchema);
