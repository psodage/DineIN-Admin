const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Member = require("../models/Member");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");
// Register models referenced via populate in billing utilities.
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
  };
}

async function run() {
  const monthArg = process.argv[2] || "2026-04";
  const month = parseMonthArg(monthArg);
  if (!month) {
    throw new Error("Usage: node scripts/backfillMemberMonthlyDueForMonth.js <YYYY-MM>");
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");

  const members = await Member.find({ status: "Active" })
    .select("_id userId status")
    .lean();

  let scanned = 0;
  let created = 0;
  let updated = 0;
  let skippedMissingUserId = 0;
  let skippedMissingBilling = 0;

  for (const member of members) {
    scanned += 1;
    if (!member?.userId) {
      skippedMissingUserId += 1;
      continue;
    }

    const billing = await calculateMemberBilling(member._id, month.start);
    if (!billing) {
      skippedMissingBilling += 1;
      continue;
    }

    const due = Math.max(0, Number(billing.remainingAmount || 0));
    const collected = Math.max(0, Number(billing.paidAmount || 0));
    const status = due > 0 ? "Pending" : "Paid";

    const res = await MemberMonthlyDue.updateOne(
      { memberId: member._id, month: month.start },
      {
        $set: {
          userId: member.userId,
          due,
          collected,
          status,
        },
        $setOnInsert: {
          memberId: member._id,
          month: month.start,
        },
      },
      { upsert: true }
    );

    const upserted = Number(res?.upsertedCount || 0) > 0;
    if (upserted) created += 1;
    else updated += 1;
  }

  console.log(`Target month: ${month.label}`);
  console.log(`Members scanned: ${scanned}`);
  console.log(`Monthly due created: ${created}`);
  console.log(`Monthly due updated: ${updated}`);
  console.log(`Skipped (missing userId): ${skippedMissingUserId}`);
  console.log(`Skipped (missing billing): ${skippedMissingBilling}`);
  console.log("Backfill rule: due=billing.remainingAmount, collected=billing.paidAmount");

  await mongoose.disconnect();
  console.log("Backfill complete");
}

run().catch(async (err) => {
  console.error("Backfill failed:", err?.message || err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});

