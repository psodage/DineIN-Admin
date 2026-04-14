const mongoose = require("mongoose");

const snackProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Marathi snack name (optional; fallback to `name` on the client)
    nameMr: { type: String, trim: true, default: "" },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      enum: ["Beverage", "Food", "Other"],
      default: "Other",
    },
    availability: {
      type: Boolean,
      default: true,
    },
    // Stock/available units for this snack product.
    // Note: ordering flow still uses `SnackOrder.quantity`; this is product-level quantity.
    quantity: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true, // adds createdAt / updatedAt
  }
);

module.exports = mongoose.model("SnackProduct", snackProductSchema);

