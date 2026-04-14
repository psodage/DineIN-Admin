const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    // Marathi title (optional; fallback to `title` on the client)
    titleMr: { type: String, trim: true, default: "" },
    category: {
      type: String,
      required: true,
      enum: ["Vegetables", "Milk", "Grocery", "Gas", "Maintenance", "Other"],
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    // Marathi description (optional; fallback to `description` on the client)
    descriptionMr: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Expense", expenseSchema);
