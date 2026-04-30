const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");
const { calculateMemberBilling } = require("../utils/billing");

function toMonthStart(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");

  const docs = await MemberMonthlyDue.find({})
    .select("_id memberId month")
    .lean();

  let updated = 0;
  let skippedInvalidMonth = 0;
  let skippedMissingBilling = 0;

  for (const doc of docs) {
    const monthStart = toMonthStart(doc.month);
    if (!monthStart) {
      skippedInvalidMonth += 1;
      continue;
    }

    const billing = await calculateMemberBilling(doc.memberId, monthStart);
    if (!billing) {
      skippedMissingBilling += 1;
      continue;
    }

    const due = Math.max(0, Number(billing.remainingAmount || 0));
    const collected = Math.max(0, Number(billing.paidAmount || 0));
    const status = due > 0 ? "Pending" : "Paid";

    await MemberMonthlyDue.collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          due,
          collected,
          status,
        },
      }
    );
    updated += 1;
  }

  console.log(`Records scanned: ${docs.length}`);
  console.log(`Records updated: ${updated}`);
  console.log(`Skipped (invalid month): ${skippedInvalidMonth}`);
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
