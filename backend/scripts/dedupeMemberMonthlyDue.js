/**
 * Removes duplicate MemberMonthlyDue rows per member per calendar month.
 * Groups by memberId + month bucket (UTC month start via $dateTrunc).
 * Keeps the document with the latest updatedAt; merges financial fields conservatively
 * (max due, max collected, latest status/lastChargedDate), then deletes the rest.
 *
 * After running, consider: npm run run:member-monthly-due-daily
 * to realign due/collected with billing if needed.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");

function pickKeeper(docs) {
  return [...docs].sort(
    (a, b) =>
      new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0) ||
      String(b._id).localeCompare(String(a._id))
  )[0];
}

function mergeFields(docs) {
  const due = Math.max(...docs.map((d) => Number(d.due || 0)));
  const collected = Math.max(...docs.map((d) => Number(d.collected || 0)));
  const lastDates = docs
    .map((d) => d.lastChargedDate)
    .filter(Boolean)
    .map((d) => new Date(d));
  const lastChargedDate =
    lastDates.length === 0
      ? null
      : new Date(Math.max(...lastDates.map((d) => d.getTime())));
  const status = due <= 0 ? "Paid" : "Pending";
  const userId = docs.find((d) => d.userId)?.userId || docs[0].userId;
  return { due, collected, lastChargedDate, status, userId };
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");

  // Group by member + calendar month (UTC) — same logical row as findOne({ memberId, month: { $gte, $lt } })
  const dupGroups = await MemberMonthlyDue.aggregate([
    {
      $group: {
        _id: {
          memberId: "$memberId",
          y: { $year: "$month" },
          m: { $month: "$month" },
        },
        ids: { $push: "$_id" },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  console.log(`Found ${dupGroups.length} duplicate month groups`);

  let groupsProcessed = 0;
  let docsDeleted = 0;

  for (const g of dupGroups) {
    const idList = g.ids.map((id) => new mongoose.Types.ObjectId(id));
    const docs = await MemberMonthlyDue.find({ _id: { $in: idList } }).lean();

    if (docs.length < 2) continue;

    const keeper = pickKeeper(docs);
    const others = docs.filter((d) => String(d._id) !== String(keeper._id));
    const merged = mergeFields(docs);

    const divergent =
      new Set(docs.map((d) => `${Number(d.due)}|${Number(d.collected)}`)).size > 1;
    if (divergent) {
      console.warn(
        `  Divergent values for memberId=${g._id.memberId} ${g._id.y}-${String(g._id.m).padStart(2, "0")} — merged with max(due), max(collected). Re-run daily job if needed.`
      );
    }

    await MemberMonthlyDue.updateOne(
      { _id: keeper._id },
      {
        $set: {
          due: merged.due,
          collected: merged.collected,
          status: merged.status,
          lastChargedDate: merged.lastChargedDate,
          userId: merged.userId,
        },
      }
    );

    const deleteIds = others.map((d) => d._id);
    const del = await MemberMonthlyDue.deleteMany({ _id: { $in: deleteIds } });
    docsDeleted += del.deletedCount || 0;
    groupsProcessed += 1;
  }

  console.log(JSON.stringify({ groupsProcessed, docsDeleted }, null, 2));
  await mongoose.disconnect();
  console.log("Done");
}

run().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
