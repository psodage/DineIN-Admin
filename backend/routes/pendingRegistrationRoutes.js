const express = require("express");
const PendingRegistration = require("../models/PendingRegistration");
const User = require("../models/User");
const Member = require("../models/Member");
const { authenticate, requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", authenticate, requireAdmin, async (_req, res) => {
  try {
    const rows = await PendingRegistration.find({})
      .sort({ createdAt: -1 })
      .select("-passwordHash")
      .lean();
    return res.json(rows);
  } catch (error) {
    console.error("Get pending registrations error:", error);
    return res.status(500).json({ message: "Failed to fetch pending registrations" });
  }
});

router.put("/approve/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const pending = await PendingRegistration.findById(id).lean();
    if (!pending) {
      return res.status(404).json({ message: "Pending registration not found" });
    }

    const normalizedEmail = String(pending.email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ message: "Pending registration email is missing" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail }).lean();
    if (existingUser) {
      await PendingRegistration.findByIdAndDelete(id);
      return res.status(409).json({
        message: "Email already exists. Removed duplicate pending registration.",
      });
    }

    const user = await User.create({
      email: normalizedEmail,
      password: pending.passwordHash,
      role: "member",
      activeSessionToken: null,
    });

    const member = await Member.create({
      userId: user._id,
      name: String(pending.name || "").trim(),
      roomOwnerName: String(pending.roomOwnerName || "").trim(),
      phone: String(pending.phone || "").trim(),
      mealPlan: ["Lunch", "Dinner", "Both"].includes(pending.mealPlan)
        ? pending.mealPlan
        : "Lunch",
      status: "Active",
    });

    await PendingRegistration.findByIdAndDelete(id);

    return res.json({
      message: "Pending registration approved successfully",
      memberId: member._id,
      userId: user._id,
    });
  } catch (error) {
    console.error("Approve pending registration error:", error);
    return res.status(500).json({ message: "Failed to approve pending registration" });
  }
});

router.put("/reject/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const pending = await PendingRegistration.findByIdAndDelete(id).lean();
    if (!pending) {
      return res.status(404).json({ message: "Pending registration not found" });
    }
    return res.json({ message: "Pending registration rejected successfully" });
  } catch (error) {
    console.error("Reject pending registration error:", error);
    return res.status(500).json({ message: "Failed to reject pending registration" });
  }
});

module.exports = router;
