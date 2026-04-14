const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const Otp = require("../models/Otp");
const { sendOtpEmail, OTP_EXPIRY_MINUTES } = require("../utils/email");
const { otpRateLimiter } = require("../middleware/rateLimiter");
const { authenticate, requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  return "secretkey";
}

/**
 * Generate a cryptographically secure 6-digit OTP
 */
function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Hash OTP for secure storage
 */
function hashOtp(otp) {
  return crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
}

// Register a new admin user
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      password: hashedPassword,
      role: "admin",
      activeSessionToken: null,
    });

    await user.save();

    return res.status(201).json({ message: "Admin registered successfully" });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /send-otp
 * Accepts email, generates OTP, stores with 5-min expiry, sends via Nodemailer.
 * Rate limited to prevent spam.
 * Used for admin accounts.
 */
router.post("/send-otp", otpRateLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail, role: "admin" });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const otp = generateOtp();
    const hashedOtp = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Delete any existing OTPs for this email
    await Otp.deleteMany({ email: normalizedEmail });

    await Otp.create({
      email: normalizedEmail,
      hashedOtp,
      expiresAt,
    });

    try {
      await sendOtpEmail(normalizedEmail, otp);
    } catch (emailError) {
      console.error("Nodemailer error:", emailError?.message || emailError);
      await Otp.deleteMany({ email: normalizedEmail });
      return res
        .status(500)
        .json({ message: "Failed to send OTP email" });
    }

    return res
      .status(200)
      .json({ message: "OTP sent successfully to your email" });
  } catch (error) {
    console.error("Send OTP error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /verify-otp
 * Accepts email and OTP, verifies match and expiry.
 * Used for admin accounts.
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const cleanOtp = String(otp).trim();
    const hashedOtp = hashOtp(cleanOtp);

    const otpRecord = await Otp.findOne({
      email: normalizedEmail,
      hashedOtp,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /reset-password
 * Accepts email, OTP, newPassword. Verifies OTP from DB, updates admin user password.
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res
        .status(400)
        .json({ message: "Email, OTP and new password are required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const cleanOtp = String(otp).trim();
    const hashedOtp = hashOtp(cleanOtp);

    const otpRecord = await Otp.findOne({
      email: normalizedEmail,
      hashedOtp,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      return res
        .status(400)
        .json({ message: "Invalid or expired OTP" });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    // Delete OTP after successful use (one-time use)
    await Otp.deleteOne({ _id: otpRecord._id });

    return res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});


// Admin login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const normalizedEmail = String(email || "").toLowerCase().trim();
    const user = await User.findOne({
      $expr: { $eq: [{ $toLower: "$email" }, normalizedEmail] },
    });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      getJwtSecret(),
      { expiresIn: "1d" }
    );

    const createdAt =
      user.createdAt ||
      (user._id && user._id.getTimestamp ? user._id.getTimestamp() : null);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        createdAt: createdAt ? new Date(createdAt).toISOString() : undefined,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/** Creation time for the logged-in admin (for UI such as menu date filter min). */
router.get("/admin-account-bounds", authenticate, requireAdmin, async (req, res) => {
  try {
    const u = req.user;
    const createdAt =
      u?.createdAt ||
      (u?._id && typeof u._id.getTimestamp === "function" ? u._id.getTimestamp() : null);
    if (!createdAt) {
      return res.json({ createdAt: null });
    }
    return res.json({ createdAt: new Date(createdAt).toISOString() });
  } catch (error) {
    console.error("admin-account-bounds error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
