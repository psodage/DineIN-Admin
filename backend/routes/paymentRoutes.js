const express = require("express");
const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Member = require("../models/Member");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");
const { calculateMemberBilling } = require("../utils/billing");
const {
  authenticate,
  requireMember,
  ensureSelfParam,
} = require("../middleware/authMiddleware");

const router = express.Router();

function normalizeMonthParamToLocalMonthStart(monthParam) {
  if (!monthParam) return null;
  const s = String(monthParam).trim();

  // Accept explicit `YYYY-MM` first.
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    const monthIndex = Number(m[2]) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return null;
    // Use local midday so persisted UTC timestamp stays same calendar date.
    return new Date(year, monthIndex, 1, 12, 0, 0, 0);
  }

  // Then accept full dates/timestamps and normalize using local parsed month.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
}

function normalizeUpiTransactionId(raw) {
  return String(raw || "").trim();
}

function parsePaidAmount(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  const normalized = String(raw || "")
    .trim()
    .replace(/,/g, "");
  return Number(normalized);
}

function getMonthWindow(monthParam) {
  const parsedMonth = normalizeMonthParamToLocalMonthStart(monthParam);
  const monthStart = parsedMonth
    ? new Date(parsedMonth.getFullYear(), parsedMonth.getMonth(), 1, 0, 0, 0, 0)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1, 0, 0, 0, 0);
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

function getMonthRange(monthParam) {
  const parsedMonth = normalizeMonthParamToLocalMonthStart(monthParam);
  if (!parsedMonth) return null;
  const monthStart = new Date(
    parsedMonth.getFullYear(),
    parsedMonth.getMonth(),
    1,
    0,
    0,
    0,
    0
  );
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

function getLocalMiddayDate(value) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) return new Date();
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    12,
    0,
    0,
    0
  );
}

function toMonthStartDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

async function applyMonthlyDuePaymentDelta({ memberId, month, deltaPaid }) {
  if (!memberId || !month || !Number.isFinite(Number(deltaPaid))) return;
  if (!mongoose.Types.ObjectId.isValid(String(memberId))) return;

  const monthRange = getMonthRange(month);
  if (!monthRange) return;
  const { monthStart, monthEnd } = monthRange;

  const member = await Member.findById(memberId).select("userId").lean();
  const existingMonthlyDue = await MemberMonthlyDue.findOne({
    memberId,
    month: { $gte: monthStart, $lt: monthEnd },
  });
  if (existingMonthlyDue?._id) {
    existingMonthlyDue.collected = Math.max(
      0,
      Number(existingMonthlyDue.collected || 0) + Number(deltaPaid || 0)
    );
    await existingMonthlyDue.save();
    return;
  }

  if (!member?.userId) return;

  const monthlyDue = await MemberMonthlyDue.findOneAndUpdate(
    {
      memberId,
      month: { $gte: monthStart, $lt: monthEnd },
    },
    {
      $setOnInsert: {
        memberId,
        userId: member.userId,
        month: monthStart,
      },
      $inc: {
        collected: Number(deltaPaid || 0),
      },
    },
    {
      new: true,
      upsert: true,
    }
  );
  if (!monthlyDue) return;

  const nextCollected = Math.max(0, Number(monthlyDue?.collected || 0));
  if (
    Number(monthlyDue?.collected || 0) !== nextCollected
  ) {
    monthlyDue.collected = nextCollected;
    await monthlyDue.save();
  }
}

async function syncMonthlyDueCollectedFromPayments({ memberId, month }) {
  if (!memberId || !month) return;
  if (!mongoose.Types.ObjectId.isValid(String(memberId))) return;

  const monthRange = getMonthRange(month);
  if (!monthRange) return;
  const { monthStart, monthEnd } = monthRange;

  const sumAgg = await Payment.aggregate([
    {
      $match: {
        memberId: new mongoose.Types.ObjectId(String(memberId)),
        month: { $gte: monthStart, $lt: monthEnd },
      },
    },
    {
      $group: {
        _id: null,
        totalPaid: { $sum: "$paidAmount" },
      },
    },
  ]);
  const totalPaid = Math.max(0, Number(sumAgg?.[0]?.totalPaid || 0));

  const existingMonthlyDue = await MemberMonthlyDue.findOne({
    memberId,
    month: { $gte: monthStart, $lt: monthEnd },
  });

  if (existingMonthlyDue?._id) {
    existingMonthlyDue.collected = totalPaid;
    await existingMonthlyDue.save();
    return;
  }

  const member = await Member.findById(memberId).select("userId").lean();
  if (!member?.userId) return;

  await MemberMonthlyDue.create({
    memberId,
    userId: member.userId,
    month: monthStart,
    due: 0,
    collected: totalPaid,
    status: totalPaid > 0 ? "Paid" : "Pending",
  });
}

// GET /api/payments/summary/monthly?month=YYYY-MM-01
router.get("/summary/monthly", async (req, res) => {
  try {
    const { monthStart, monthEnd } = getMonthWindow(req.query.month);

    const dueTotals = await MemberMonthlyDue.aggregate([
      { $match: { month: { $gte: monthStart, $lt: monthEnd } } },
      {
        $group: {
          _id: null,
          collected: { $sum: "$collected" },
          pending: { $sum: "$due" },
          membersPaid: {
            $sum: {
              $cond: [{ $lte: ["$due", 0] }, 1, 0],
            },
          },
          remainingMembers: {
            $sum: {
              $cond: [{ $gt: ["$due", 0] }, 1, 0],
            },
          },
        },
      },
    ]);

    return res.json({
      month: monthStart,
      collected: Number(dueTotals?.[0]?.collected || 0),
      pending: Number(dueTotals?.[0]?.pending || 0),
      membersPaid: Number(dueTotals?.[0]?.membersPaid || 0),
      remainingMembers: Number(dueTotals?.[0]?.remainingMembers || 0),
    });
  } catch (error) {
    console.error("Get monthly payment summary error:", error);
    return res.status(500).json({ message: "Failed to fetch monthly payment summary" });
  }
});

// GET /api/payments - Fetch all payments
router.get("/", async (req, res) => {
  try {
    const rawPayments = await Payment.find()
      .sort({ month: -1, createdAt: -1 })
      .populate("memberId", "name nameMr rollNumber roomOwnerName roomOwnerNameMr mealPlan mealPlanMr status statusMr")
      .lean();
    const payments = rawPayments;

    const billingCache = new Map();

    const enriched = await Promise.all(
      payments.map(async (p) => {
        const memberId = p?.memberId?._id || p?.memberId;
        const monthKey = p?.month ? String(new Date(p.month).toISOString()) : "";
        const key = `${memberId}-${monthKey}`;

        if (!billingCache.has(key)) {
          const billing = await calculateMemberBilling(memberId, p.month);
          billingCache.set(key, billing);
        }

        const billing = billingCache.get(key);

        return {
          ...p,
          memberName: p?.memberId?.name,
          memberNameMr: p?.memberId?.nameMr || p?.memberId?.name,
          totalMessFee: billing?.mealAmount || 0,
          snacksAmount: billing?.snacksAmount || 0,
          expenseShare: billing?.expenseShare || 0,
          totalBill: billing?.totalBill || 0,
          paidAmountComputed: billing?.paidAmount || 0,
          remainingAmount: billing?.remainingAmount || 0,
          status: billing?.status || "Pending",
        };
      })
    );

    res.json(enriched);
  } catch (error) {
    console.error("Get payments error:", error);
    res.status(500).json({ message: "Failed to fetch payments" });
  }
});

// GET /api/payments/:memberId - member's payment history (admin/billing computed)
router.get(
  "/:memberId",
  authenticate,
  requireMember,
  ensureSelfParam("memberId"),
  async (req, res) => {
    try {
      const { memberId } = req.params;
      const rawPayments = await Payment.find({ memberId })
        .sort({ month: -1, createdAt: -1 })
        .populate("memberId", "name nameMr rollNumber roomOwnerName roomOwnerNameMr mealPlan mealPlanMr status statusMr")
        .lean();
      const payments = rawPayments;

      const billingCache = new Map();
      const enriched = await Promise.all(
        payments.map(async (p) => {
          const monthKey = p?.month ? String(new Date(p.month).toISOString()) : "";
          const key = `${memberId}-${monthKey}`;

          if (!billingCache.has(key)) {
            const billing = await calculateMemberBilling(memberId, p.month);
            billingCache.set(key, billing);
          }

          const billing = billingCache.get(key);

          return {
            ...p,
            memberName: p?.memberId?.name,
            memberNameMr: p?.memberId?.nameMr || p?.memberId?.name,
            totalMessFee: billing?.mealAmount || 0,
            snacksAmount: billing?.snacksAmount || 0,
            expenseShare: billing?.expenseShare || 0,
            totalBill: billing?.totalBill || 0,
            paidAmountComputed: billing?.paidAmount || 0,
            remainingAmount: billing?.remainingAmount || 0,
            status: billing?.status || "Pending",
          };
        })
      );

      res.json(enriched);
    } catch (error) {
      console.error("Get member payments error:", error);
      res.status(500).json({ message: "Failed to fetch member payments" });
    }
  }
);

// POST /api/payments - Create payment
router.post("/", async (req, res) => {
  try {
    const {
      memberId,
      month,
      paidAmount,
      paymentMethod,
      upiTransactionId,
      date,
      // legacy fields (ignored)
      studentId,
      studentName,
      totalMessFee,
      remainingAmount,
      status,
    } = req.body;

    const member = memberId || studentId;
    if (!member || !month) {
      return res.status(400).json({ message: "memberId and month are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(String(member))) {
      return res.status(400).json({ message: "Invalid memberId" });
    }
    const memberExists = await Member.exists({ _id: member });
    if (!memberExists) {
      return res.status(404).json({ message: "Member not found" });
    }

    const paid = parsePaidAmount(paidAmount);
    if (!Number.isFinite(paid) || paid <= 0) {
      return res.status(400).json({ message: "Invalid paidAmount" });
    }
    const monthDate = normalizeMonthParamToLocalMonthStart(month);
    if (!monthDate) return res.status(400).json({ message: "Invalid month" });
    const normalizedPaymentMethod = ["Cash", "UPI"].includes(paymentMethod)
      ? paymentMethod
      : "Cash";
    const normalizedUpiTransactionId = normalizeUpiTransactionId(upiTransactionId);
    if (normalizedPaymentMethod === "UPI" && !normalizedUpiTransactionId) {
      return res
        .status(400)
        .json({ message: "UPI transaction ID is required for UPI payments" });
    }

    // For mark-payment, always store today's local date.
    // Ignore incoming `date` to avoid old/month dates being persisted.
    const paymentDate = getLocalMiddayDate();

    const payment = await Payment.create({
      memberId: member,
      month: monthDate,
      paidAmount: paid,
      paymentMethod: normalizedPaymentMethod,
      upiTransactionId: normalizedPaymentMethod === "UPI" ? normalizedUpiTransactionId : "",
      date: paymentDate,
    });

    await applyMonthlyDuePaymentDelta({
      memberId: member,
      month: monthDate,
      deltaPaid: paid,
    });
    await syncMonthlyDueCollectedFromPayments({
      memberId: member,
      month: monthDate,
    });

    await payment.populate("memberId", "name rollNumber roomOwnerName");
    res.status(201).json(payment);
  } catch (error) {
    console.error("Create payment error:", error);
    res.status(500).json({ message: "Failed to create payment" });
  }
});

// PUT /api/payments/:id - Update payment
router.put("/:id", async (req, res) => {
  try {
    const {
      memberId,
      month,
      paidAmount,
      paymentMethod,
      upiTransactionId,
      date,
      // legacy fields (ignored)
      studentId,
      studentName,
      totalMessFee,
      remainingAmount,
      status,
    } = req.body;

    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }
    const previousPaymentSnapshot = {
      memberId: payment.memberId,
      month: payment.month,
      paidAmount: Number(payment.paidAmount) || 0,
    };

    const resolvedMemberId = memberId || studentId;
    if (resolvedMemberId !== undefined) {
      if (resolvedMemberId) {
        if (!mongoose.Types.ObjectId.isValid(String(resolvedMemberId))) {
          return res.status(400).json({ message: "Invalid memberId" });
        }
        const memberExists = await Member.exists({ _id: resolvedMemberId });
        if (!memberExists) {
          return res.status(404).json({ message: "Member not found" });
        }
      }
      payment.memberId = resolvedMemberId || undefined;
    }

    if (month) {
      const monthDate = normalizeMonthParamToLocalMonthStart(month);
      if (monthDate) payment.month = monthDate;
    }

    if (paidAmount != null) payment.paidAmount = Number(paidAmount) || 0;

    if (paymentMethod && ["Cash", "UPI"].includes(paymentMethod)) {
      payment.paymentMethod = paymentMethod;
    }
    const normalizedUpiTransactionId = normalizeUpiTransactionId(upiTransactionId);
    if (payment.paymentMethod === "UPI") {
      if (upiTransactionId !== undefined) {
        payment.upiTransactionId = normalizedUpiTransactionId;
      }
      if (!String(payment.upiTransactionId || "").trim()) {
        return res
          .status(400)
          .json({ message: "UPI transaction ID is required for UPI payments" });
      }
    } else {
      payment.upiTransactionId = "";
    }

    if (date) {
      const d = new Date(date);
      if (!isNaN(d.getTime())) payment.date = d;
    }
    await payment.save();

    await applyMonthlyDuePaymentDelta({
      memberId: previousPaymentSnapshot.memberId,
      month: previousPaymentSnapshot.month,
      deltaPaid: -previousPaymentSnapshot.paidAmount,
    });
    await applyMonthlyDuePaymentDelta({
      memberId: payment.memberId,
      month: payment.month,
      deltaPaid: Number(payment.paidAmount) || 0,
    });
    await syncMonthlyDueCollectedFromPayments({
      memberId: previousPaymentSnapshot.memberId,
      month: previousPaymentSnapshot.month,
    });
    await syncMonthlyDueCollectedFromPayments({
      memberId: payment.memberId,
      month: payment.month,
    });

    await payment.populate("memberId", "name rollNumber roomOwnerName");
    res.json(payment);
  } catch (error) {
    console.error("Update payment error:", error);
    res.status(500).json({ message: "Failed to update payment" });
  }
});

// DELETE /api/payments/:id
router.delete("/:id", async (req, res) => {
  try {
    const payment = await Payment.findByIdAndDelete(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    await applyMonthlyDuePaymentDelta({
      memberId: payment.memberId,
      month: payment.month,
      deltaPaid: -(Number(payment.paidAmount) || 0),
    });
    await syncMonthlyDueCollectedFromPayments({
      memberId: payment.memberId,
      month: payment.month,
    });

    res.json({ message: "Payment deleted" });
  } catch (error) {
    console.error("Delete payment error:", error);
    res.status(500).json({ message: "Failed to delete payment" });
  }
});

module.exports = router;
