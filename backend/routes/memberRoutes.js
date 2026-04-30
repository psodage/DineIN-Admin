const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const Member = require("../models/Member");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");
const MealType = require("../models/MealType");
const User = require("../models/User");
const { calculateMemberBilling } = require("../utils/billing");

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

function getMonthBounds(monthParam) {
  const monthStart = parseMonth(monthParam);
  if (!monthStart) return null;
  const monthEnd = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    1,
    0,
    0,
    0,
    0
  );
  return { monthStart, monthEnd };
}

function toMonthStart(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function pickLatestDueByMonth(rows) {
  const byMonth = new Map();
  for (const row of rows || []) {
    const monthStart = toMonthStart(row?.month);
    if (!monthStart) continue;
    const key = monthStart.toISOString();
    const existing = byMonth.get(key);
    const existingUpdatedAt = existing?.updatedAt
      ? new Date(existing.updatedAt).getTime()
      : 0;
    const nextUpdatedAt = row?.updatedAt ? new Date(row.updatedAt).getTime() : 0;
    if (!existing || nextUpdatedAt >= existingUpdatedAt) {
      byMonth.set(key, {
        ...row,
        month: monthStart,
      });
    }
  }
  return Array.from(byMonth.values()).sort(
    (a, b) => new Date(a.month).getTime() - new Date(b.month).getTime()
  );
}

router.get("/", async (_req, res) => {
  try {
    const mealTypes = await MealType.find({}).select("mealPlan price").lean();
    const mealPriceByPlan = mealTypes.reduce((acc, row) => {
      const key = String(row?.mealPlan || "").toLowerCase();
      if (!key) return acc;
      acc[key] = Number(row?.price || 0);
      return acc;
    }, {});

    const members = await Member.find({})
      .sort({ createdAt: -1 })
      .populate("userId", "email")
      .lean();

    const rows = members.map((m) => ({
      ...m,
      email: m?.userId?.email || "",
      mealPlanPrice: Number(
        mealPriceByPlan[String(m?.mealPlan || "").toLowerCase()] || 0
      ),
    }));
    return res.json(rows);
  } catch (error) {
    console.error("Get members error:", error);
    return res.status(500).json({ message: "Failed to fetch members" });
  }
});

router.get("/due-month", async (req, res) => {
  try {
    const { monthStart, monthEnd } =
      getMonthBounds(req.query.month) ||
      (() => {
        const nowStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const nowEnd = new Date(
          nowStart.getFullYear(),
          nowStart.getMonth() + 1,
          1,
          0,
          0,
          0,
          0
        );
        return { monthStart: nowStart, monthEnd: nowEnd };
      })();

    const monthRows = await MemberMonthlyDue.find({
      month: { $gte: monthStart, $lt: monthEnd },
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const latestByMemberId = new Map();
    for (const row of monthRows) {
      const memberKey = String(row?.memberId || "");
      if (!memberKey || latestByMemberId.has(memberKey)) continue;
      latestByMemberId.set(memberKey, row);
    }

    const members = await Member.find({})
      .populate("userId", "email")
      .lean();
    const memberById = new Map(members.map((m) => [String(m._id), m]));

    const billings = (
      await Promise.all(
        Array.from(memberById.entries()).map(async ([memberId, m]) => {
          const monthlyDue = latestByMemberId.get(memberId);
          let dueAmount = Math.max(0, Number(monthlyDue?.due || 0));
          let collectedAmount = Math.max(0, Number(monthlyDue?.collected || 0));
          let remainingAmount = dueAmount;
          let totalBill = Math.max(0, dueAmount);

          // Fallback: if monthly due cache row is missing for this member/month,
          // compute due from billing so UI does not show N/A.
          if (!monthlyDue) {
            const billing = await calculateMemberBilling(memberId, monthStart);
            dueAmount = Math.max(0, Number(billing?.totalBill || 0));
            collectedAmount = Math.max(0, Number(billing?.paidAmount || 0));
            remainingAmount = Math.max(0, Number(billing?.remainingAmount || 0));
            totalBill = Math.max(0, Number(billing?.totalBill || dueAmount));
          }

          return {
            memberId,
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
            totalBill,
            paidAmount: collectedAmount,
            remainingAmount,
            dueAmount,
            monthlyStatus: remainingAmount <= 0 ? "Paid" : "Pending",
          };
        })
      )
    ).filter(Boolean);

    const totals = billings.reduce(
      (acc, m) => {
        const hasBill = Number(m.totalBill || 0) > 0;
        acc.collected += Number(m.paidAmount || 0);
        acc.pending += Number(m.remainingAmount || 0);
        if (hasBill && Number(m.remainingAmount || 0) <= 0) acc.membersPaid += 1;
        if (hasBill && Number(m.remainingAmount || 0) > 0) acc.remainingMembers += 1;
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

router.get("/:id/monthly-due", async (req, res) => {
  try {
    const { id } = req.params;
    const bounds =
      getMonthBounds(req.query.month) ||
      (() => {
        const nowStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const nowEnd = new Date(
          nowStart.getFullYear(),
          nowStart.getMonth() + 1,
          1,
          0,
          0,
          0,
          0
        );
        return { monthStart: nowStart, monthEnd: nowEnd };
      })();
    const { monthStart, monthEnd } = bounds;
    const rows = await MemberMonthlyDue.find({
      memberId: id,
      month: { $gte: monthStart, $lt: monthEnd },
    })
      .select("due collected status month updatedAt")
      .lean();
    const latestRows = pickLatestDueByMonth(rows);
    const row = latestRows[0] || null;

    const dueFromMonthlyDue = Math.max(0, Number(row?.due || 0));
    const collectedFromMonthlyDue = Math.max(0, Number(row?.collected || 0));
    const remainingForMonth = dueFromMonthlyDue;

    return res.json({
      memberId: id,
      month: monthStart,
      due: remainingForMonth,
      paidForMonth: collectedFromMonthlyDue,
      remainingForMonth,
      status: remainingForMonth <= 0 ? "Paid" : row?.status || "Pending",
    });
  } catch (error) {
    console.error("Get member monthly due error:", error);
    return res.status(500).json({ message: "Failed to fetch member monthly due" });
  }
});

router.get("/:id/monthly-due-months", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid member id" });
    }

    const rows = await MemberMonthlyDue.find({
      memberId: id,
    })
      .select("month due collected status updatedAt")
      .sort({ month: 1 })
      .lean();
    const latestRows = pickLatestDueByMonth(rows)
      .map((row) => {
        const due = Math.max(0, Number(row?.due || 0));
        const collected = Math.max(0, Number(row?.collected || 0));
        const remaining = due;
        return { ...row, due, collected, remaining };
      })
      .filter((row) => row.remaining > 0);

    return res.json({
      memberId: id,
      months: latestRows.map((row) => ({
        month: row.month,
        due: row.remaining,
        status: row.remaining <= 0 ? "Paid" : row?.status || "Pending",
      })),
    });
  } catch (error) {
    console.error("Get member monthly due months error:", error);
    return res.status(500).json({ message: "Failed to fetch member monthly due months" });
  }
});

router.get("/:id/monthly-due-total", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid member id" });
    }
    const rows = await MemberMonthlyDue.find({
      memberId: new mongoose.Types.ObjectId(id),
    })
      .select("month due collected updatedAt")
      .lean();
    const latestRows = pickLatestDueByMonth(rows);
    const totalDue = latestRows.reduce((sum, row) => {
      const due = Math.max(0, Number(row?.due || 0));
      const collected = Math.max(0, Number(row?.collected || 0));
      const remaining = due;
      return remaining > 0 ? sum + remaining : sum;
    }, 0);
    return res.json({
      memberId: id,
      totalDue,
    });
  } catch (error) {
    console.error("Get member monthly due total error:", error);
    return res.status(500).json({ message: "Failed to fetch member total monthly due" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const member = await Member.findById(id).populate("userId", "email").lean();
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }
    const mealType = await MealType.findOne({ mealPlan: member?.mealPlan || "Lunch" })
      .select("price")
      .lean();

    return res.json({
      ...member,
      email: member?.userId?.email || "",
      mealPlanPrice: Number(mealType?.price || 0),
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
