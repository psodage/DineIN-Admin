const mongoose = require("mongoose");

const pendingRegistrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    roomOwnerName: { type: String, required: true, trim: true },
    mealPlan: {
      type: String,
      enum: ["Lunch", "Dinner", "Both"],
      required: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "PendingRegistration",
  pendingRegistrationSchema,
  "pending_registrations"
);

