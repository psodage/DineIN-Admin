const express = require("express");
const bcrypt = require("bcryptjs");
const Member = require("../models/Member");
const User = require("../models/User");
const { calculateMemberBilling, getMonthRange } = require("../utils/billing");

const router = express.Router();

function parseMonth(monthParam) {
  const value = String(monthParam || "").trim();
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return new Date(year, monthIndex, 1, 0, 0, 0, 0);
}

router.get("/", async (_req, res) => {
  try {
    const members = await Member.find({})
      .sort({ createdAt: -1 })
      .populate("userId", "email")
      .lean();

    const rows = members.map((m) => ({
      ...m,
      email: m?.userId?.email || "",
    }));
    return res.json(rows);
  } catch (error) {
    console.error("Get members error:", error);
    return res.status(500).json({ message: "Failed to fetch members" });
  }
});

router.get("/due-month", async (req, res) => {
  try {
    const monthStart = parseMonth(req.query.month) || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const members = await Member.find({}).populate("userId", "email").lean();

    const billings = await Promise.all(
      members.map(async (m) => {
        const b = await calculateMemberBilling(m._id, monthStart);
        const paidAmount = Number(b?.paidAmount || 0);
        const remainingAmount = Number(b?.remainingAmount || 0);
        return {
          memberId: String(m._id),
          _id: m._id,
          name: m.name || "",
          nameMr: m.nameMr || m.name || "",
          roomOwnerName: m.roomOwnerName || m.roomNumber || "",
          roomOwnerNameMr: m.roomOwnerNameMr || m.roomOwnerName || m.roomNumber || "",
          roomNumber: m.roomNumber || "",
          rollNumber: m.rollNumber || "",
          status: m.status || "Active",
          mealPlan: m.mealPlan || "Lunch",
          email: m?.userId?.email || "",
          paidAmount,
          remainingAmount,
          dueAmount: remainingAmount,
          monthlyStatus: remainingAmount <= 0 ? "Paid" : "Pending",
        };
      })
    );

    const totals = billings.reduce(
      (acc, m) => {
        acc.collected += Number(m.paidAmount || 0);
        acc.pending += Number(m.remainingAmount || 0);
        if (Number(m.remainingAmount || 0) <= 0) acc.membersPaid += 1;
        else acc.remainingMembers += 1;
        return acc;
      },
      { collected: 0, pending: 0, membersPaid: 0, remainingMembers: 0 }
    );

    return res.json({
      month: monthStart,
      totals,
      members: billings,
    });
  } catch (error) {
    console.error("Get due-month error:", error);
    return res.status(500).json({ message: "Failed to fetch month due totals" });
  }
});

router.get("/:id/due", async (req, res) => {
  try {
    const { id } = req.params;
    const monthStart = parseMonth(req.query.month) || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const billing = await calculateMemberBilling(id, monthStart);
    if (!billing) {
      return res.status(404).json({ message: "Member not found" });
    }
    return res.json({
      month: monthStart,
      remainingForMonth: Number(billing.remainingAmount || 0),
      totalBill: Number(billing.totalBill || 0),
      paidAmount: Number(billing.paidAmount || 0),
      status: billing.status || "Pending",
    });
  } catch (error) {
    console.error("Get member due error:", error);
    return res.status(500).json({ message: "Failed to fetch member due" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const member = await Member.findById(id).populate("userId", "email").lean();
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }
    return res.json({
      ...member,
      email: member?.userId?.email || "",
    });
  } catch (error) {
    console.error("Get member by id error:", error);
    return res.status(500).json({ message: "Failed to fetch member details" });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      name,
      nameMr,
      roomOwnerName,
      roomOwnerNameMr,
      phone,
      email,
      password,
      joiningDate,
      status,
      mealPlan,
    } = req.body || {};

    if (!name || !roomOwnerName || !phone || !password) {
      return res.status(400).json({ message: "name, roomOwnerName, phone and password are required" });
    }

    let user = null;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (normalizedEmail) {
      const exists = await User.findOne({ email: normalizedEmail }).lean();
      if (exists) return res.status(400).json({ message: "Email already exists" });
      const hashed = await bcrypt.hash(String(password), 10);
      user = await User.create({
        email: normalizedEmail,
        password: hashed,
        role: "member",
        activeSessionToken: null,
      });
    }

    const member = await Member.create({
      userId: user?._id,
      name: String(name).trim(),
      nameMr: String(nameMr || "").trim(),
      roomOwnerName: String(roomOwnerName).trim(),
      roomOwnerNameMr: String(roomOwnerNameMr || "").trim(),
      phone: String(phone).trim(),
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      status: status === "Inactive" ? "Inactive" : "Active",
      mealPlan: ["Lunch", "Dinner", "Both"].includes(mealPlan) ? mealPlan : "Lunch",
    });

    const saved = await Member.findById(member._id).populate("userId", "email").lean();
    return res.status(201).json({ ...saved, email: saved?.userId?.email || "" });
  } catch (error) {
    console.error("Create member error:", error);
    return res.status(500).json({ message: "Failed to create member" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const member = await Member.findById(id);
    if (!member) return res.status(404).json({ message: "Member not found" });

    const {
      name,
      nameMr,
      roomOwnerName,
      roomOwnerNameMr,
      phone,
      email,
      password,
      joiningDate,
      status,
      mealPlan,
    } = req.body || {};

    if (name !== undefined) member.name = String(name).trim();
    if (nameMr !== undefined) member.nameMr = String(nameMr || "").trim();
    if (roomOwnerName !== undefined) member.roomOwnerName = String(roomOwnerName).trim();
    if (roomOwnerNameMr !== undefined) member.roomOwnerNameMr = String(roomOwnerNameMr || "").trim();
    if (phone !== undefined) member.phone = String(phone).trim();
    if (joiningDate) member.joiningDate = new Date(joiningDate);
    if (status && ["Active", "Inactive"].includes(status)) member.status = status;
    if (mealPlan && ["Lunch", "Dinner", "Both"].includes(mealPlan)) member.mealPlan = mealPlan;

    if (member.userId) {
      const user = await User.findById(member.userId);
      if (user) {
        if (email !== undefined && String(email).trim()) {
          user.email = String(email).trim().toLowerCase();
        }
        if (password !== undefined && String(password).trim()) {
          user.password = await bcrypt.hash(String(password), 10);
        }
        await user.save();
      }
    }

    await member.save();
    const saved = await Member.findById(id).populate("userId", "email").lean();
    return res.json({ ...saved, email: saved?.userId?.email || "" });
  } catch (error) {
    console.error("Update member error:", error);
    return res.status(500).json({ message: "Failed to update member" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const member = await Member.findByIdAndDelete(id).lean();
    if (!member) return res.status(404).json({ message: "Member not found" });
    if (member.userId) await User.findByIdAndDelete(member.userId);
    return res.json({ message: "Member deleted" });
  } catch (error) {
    console.error("Delete member error:", error);
    return res.status(500).json({ message: "Failed to delete member" });
  }
});

module.exports = router;
