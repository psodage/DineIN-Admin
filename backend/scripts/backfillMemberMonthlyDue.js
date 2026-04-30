const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Member = require("../models/Member");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");

function getCurrentMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");

  const month = getCurrentMonthStart();
  const members = await Member.find({}).select("_id userId").lean();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const member of members) {
    if (!member?.userId) {
      skipped += 1;
      continue;
    }

    const existing = await MemberMonthlyDue.findOne({
      memberId: member._id,
      month,
    })
      .select("_id")
      .lean();

    if (existing) {
      await MemberMonthlyDue.updateOne(
        { _id: existing._id },
        {
          $set: { userId: member.userId },
        }
      );
      updated += 1;
      continue;
    }

    await MemberMonthlyDue.create({
      memberId: member._id,
      userId: member.userId,
      month,
      due: 0,
      status: "Pending",
    });
    created += 1;
  }

  console.log(`Members scanned: ${members.length}`);
  console.log(`Monthly due created: ${created}`);
  console.log(`Monthly due updated: ${updated}`);
  console.log(`Skipped (missing userId): ${skipped}`);
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
