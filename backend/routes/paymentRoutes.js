const express = require("express");
const Payment = require("../models/Payment");
const { calculateMemberBilling } = require("../utils/billing");
const { upsertMemberMonthlyBill } = require("../utils/memberMonthlyBillCache");
const {
  authenticate,
  requireMember,
  ensureSelfParam,
} = require("../middleware/authMiddleware");

const router = express.Router();

function normalizeMonthParamToLocalMonthStart(monthParam) {
  if (!monthParam) return null;
  const s = String(monthParam).trim();

  // Accept `YYYY-MM`, `YYYY-MM-DD`, and `YYYY-MM-DDTHH:mm:ss.sssZ` (or similar).
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (m) {
    const year = Number(m[1]);
    const monthIndex = Number(m[2]) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return null;
    return new Date(year, monthIndex, 1, 0, 0, 0, 0);
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

// GET /api/payments - Fetch all payments
router.get("/", async (req, res) => {
  try {
    const payments = await Payment.find()
      .sort({ month: -1, createdAt: -1 })
      .populate("memberId", "name nameMr rollNumber roomOwnerName roomOwnerNameMr mealPlan mealPlanMr status statusMr")
      .lean();

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
      const payments = await Payment.find({ memberId })
        .sort({ month: -1, createdAt: -1 })
        .populate("memberId", "name nameMr rollNumber roomOwnerName roomOwnerNameMr mealPlan mealPlanMr status statusMr")
        .lean();

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

    const paid = Number(paidAmount) || 0;
    const monthDate = normalizeMonthParamToLocalMonthStart(month);
    if (!monthDate) return res.status(400).json({ message: "Invalid month" });

    const paymentDate = date ? new Date(date) : new Date();

    const payment = await Payment.create({
      memberId: member || undefined,
      month: monthDate,
      paidAmount: paid,
      paymentMethod: ["Cash", "UPI", "Bank Transfer"].includes(paymentMethod)
        ? paymentMethod
        : "Cash",
      date: paymentDate,
    });

    // Update monthly billing cache so due totals reflect this payment.
    await upsertMemberMonthlyBill(member, monthDate);

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

    const resolvedMemberId = memberId || studentId;
    if (resolvedMemberId !== undefined) payment.memberId = resolvedMemberId || undefined;

    if (month) {
      const monthDate = normalizeMonthParamToLocalMonthStart(month);
      if (monthDate) payment.month = monthDate;
    }

    if (paidAmount != null) payment.paidAmount = Number(paidAmount) || 0;

    if (paymentMethod && ["Cash", "UPI", "Bank Transfer"].includes(paymentMethod)) {
      payment.paymentMethod = paymentMethod;
    }

    if (date) {
      const d = new Date(date);
      if (!isNaN(d.getTime())) payment.date = d;
    }
    await payment.save();

    // Update monthly billing cache so due totals reflect this update.
    if (payment?.memberId && payment?.month) {
      await upsertMemberMonthlyBill(payment.memberId, payment.month);
    }

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

    // Update monthly billing cache so due totals reflect this deletion.
    if (payment?.memberId && payment?.month) {
      await upsertMemberMonthlyBill(payment.memberId, payment.month);
    }

    res.json({ message: "Payment deleted" });
  } catch (error) {
    console.error("Delete payment error:", error);
    res.status(500).json({ message: "Failed to delete payment" });
  }
});

module.exports = router;
