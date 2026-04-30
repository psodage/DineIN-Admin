const mongoose = require("mongoose");

const mealTypeSchema = new mongoose.Schema(
  {
    mealPlan: {
      type: String,
      required: true,
      enum: ["Lunch", "Dinner", "Both"],
      unique: true,
      trim: true,
    },
    mealPlanMr: {
      type: String,
      required: true,
      trim: true,
      default: "",
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MealType", mealTypeSchema);
