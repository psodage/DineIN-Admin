const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    name: { type: String, required: true, trim: true },
    nameMr: { type: String, trim: true, default: "" },
    roomOwnerName: { type: String, trim: true, default: "" },
    roomOwnerNameMr: { type: String, trim: true, default: "" },
    roomNumber: { type: String, trim: true, default: "" },
    rollNumber: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    joiningDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    statusMr: { type: String, trim: true, default: "" },
    mealPlan: {
      type: String,
      enum: ["Lunch", "Dinner", "Both"],
      default: "Lunch",
    },
    mealTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MealType",
      index: true,
      default: null,
    },
    mealPlanMr: { type: String, trim: true, default: "" },
    totalMessFee: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Member", memberSchema);
