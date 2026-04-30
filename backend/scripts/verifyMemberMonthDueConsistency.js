const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");
const { calculateMemberBilling } = require("../utils/billing");

async function run() {
  const memberId = process.argv[2];
  const monthArg = process.argv[3] || "2026-04";
  if (!memberId) {
    throw new Error("Usage: node scripts/verifyMemberMonthDueConsistency.js <memberId> [YYYY-MM]");
  }

  const match = String(monthArg).match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error("Month must be YYYY-MM");
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const monthStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);

  await mongoose.connect(process.env.MONGODB_URI);

  const payment = await Payment.findOne({
    memberId,
    month: { $gte: monthStart, $lt: monthEnd },
  }).lean();
  const monthlyDue = await MemberMonthlyDue.findOne({
    memberId,
    month: { $gte: monthStart, $lt: monthEnd },
  }).lean();
  const billing = await calculateMemberBilling(memberId, monthStart);

  console.log(
    JSON.stringify(
      {
        memberId,
        month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
        paymentPaidAmount: Number(payment?.paidAmount || 0),
        monthlyDueDue: Number(monthlyDue?.due || 0),
        monthlyDueCollected: Number(monthlyDue?.collected || 0),
        monthlyDueStatus: monthlyDue?.status || null,
        billingTotal: Number(billing?.totalBill || 0),
        billingPaid: Number(billing?.paidAmount || 0),
        billingRemaining: Number(billing?.remainingAmount || 0),
        billingStatus: billing?.status || null,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Verification failed:", err?.message || err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
