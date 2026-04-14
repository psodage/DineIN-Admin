const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    hashedOtp: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// TTL index: auto-delete expired OTPs after 1 hour of expiry (cleanup)
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model("Otp", otpSchema);
