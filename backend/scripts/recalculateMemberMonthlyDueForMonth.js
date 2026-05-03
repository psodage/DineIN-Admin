const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");
// Register models referenced via populate inside billing utilities.
require("../models/SnackProduct");
const { calculateMemberBilling } = require("../utils/billing");

function parseMonthArg(monthArg) {
  const match = String(monthArg || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return {
    label: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    start: new Date(year, monthIndex, 1, 0, 0, 0, 0),
    end: new Date(year, monthIndex + 1, 1, 0, 0, 0, 0),
  };
}

async function run() {
  const monthArg = process.argv[2];
  const month = parseMonthArg(monthArg);
  if (!month) {
    throw new Error("Usage: node scripts/recalculateMemberMonthlyDueForMonth.js <YYYY-MM>");
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");

  const docs = await MemberMonthlyDue.find({
    month: { $gte: month.start, $lt: month.end },
  })
    .select("_id memberId")
    .lean();

  let updated = 0;
  let skippedMissingBilling = 0;

  for (const doc of docs) {
    const billing = await calculateMemberBilling(doc.memberId, month.start);
    if (!billing) {
      skippedMissingBilling += 1;
      continue;
    }

    const due = Math.max(0, Number(billing.remainingAmount || 0));
    const collected = Math.max(0, Number(billing.paidAmount || 0));
    const status = due > 0 ? "Pending" : "Paid";

    await MemberMonthlyDue.collection.updateOne(
      { _id: doc._id },
      { $set: { due, collected, status } }
    );
    updated += 1;
  }

  console.log(`Target month: ${month.label}`);
  console.log(`Records scanned: ${docs.length}`);
  console.log(`Records updated: ${updated}`);
  console.log(`Skipped (missing billing): ${skippedMissingBilling}`);
  console.log("Due rule: due = billing.remainingAmount (payments included)");

  await mongoose.disconnect();
  console.log("Recalculation complete");
}

run().catch(async (err) => {
  console.error("Recalculation failed:", err?.message || err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
