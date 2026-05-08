const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Member = require("../models/Member");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");

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

async function upsertMonthForAllMembers(month) {
  const members = await Member.find({}).select("_id userId").lean();

  let created = 0;
  let updated = 0;

  for (const member of members) {
    const res = await MemberMonthlyDue.updateOne(
      { memberId: member._id, month: month.start },
      {
        $set: {
          userId: member.userId || null,
        },
        $setOnInsert: {
          memberId: member._id,
          month: month.start,
          due: 0,
          collected: 0,
          status: "Pending",
          lastChargedDate: null,
        },
      },
      { upsert: true }
    );

    const upserted = Number(res?.upsertedCount || 0) > 0;
    if (upserted) created += 1;
    else updated += 1;
  }

  return { totalMembers: members.length, created, updated };
}

async function run() {
  const monthArgs = process.argv.slice(2);
  const defaults = ["2026-04", "2026-05"];
  const targets = (monthArgs.length ? monthArgs : defaults).map(parseMonthArg);

  if (targets.some((m) => !m)) {
    throw new Error(
      "Usage: node scripts/backfillMemberMonthlyDueForMonths.js <YYYY-MM> <YYYY-MM> ...\nExample: node scripts/backfillMemberMonthlyDueForMonths.js 2026-04 2026-05"
    );
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");

  for (const month of targets) {
    const result = await upsertMonthForAllMembers(month);
    console.log(`Month: ${month.label}`);
    console.log(`Members scanned: ${result.totalMembers}`);
    console.log(`Monthly due created: ${result.created}`);
    console.log(`Monthly due updated: ${result.updated}`);
  }

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
