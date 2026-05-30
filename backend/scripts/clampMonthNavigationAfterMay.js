/**
 * Database maintenance so admin month pickers do not go earlier than June.
 * (Pickers use the earliest month in payments / expenses / snacks; Member Details uses joiningDate.)
 *
 * Does not change application code.
 *
 * Usage:
 *   node scripts/clampMonthNavigationAfterMay.js
 *       List Jan–May rows (dry-run)
 *
 *   node scripts/clampMonthNavigationAfterMay.js --apply-delete
 *       Remove payments / expenses / snacks dated in Jan–May (any year)
 *
 *   node scripts/clampMonthNavigationAfterMay.js --apply-clamp-joining
 *       Set member joiningDate from Jan–May to 1 June of the same year
 *
 *   node scripts/clampMonthNavigationAfterMay.js --apply-delete --apply-clamp-joining
 *       Both of the above
 *
 * Optional:
 *   MONTH_NAV_FIRST_YEAR=2025   only records/members from this year onward
 *
 * Limitation (cannot fix via DB alone):
 *   Payments screen with NO payment rows still allows ~24 months back in the app.
 *   Add at least one real payment with month >= 1 June, or accept that fallback.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const APPLY_DELETE = process.argv.includes("--apply-delete");
const APPLY_CLAMP_JOINING = process.argv.includes("--apply-clamp-joining");
const FIRST_YEAR = Number(process.env.MONTH_NAV_FIRST_YEAR || 0) || null;

function monthIndex1to12(d) {
  return new Date(d).getUTCMonth() + 1;
}

function yearOf(d) {
  return new Date(d).getUTCFullYear();
}

function isJanThroughMay(d) {
  const m = monthIndex1to12(d);
  return m >= 1 && m <= 5;
}

function juneFirstUtc(year) {
  return new Date(Date.UTC(year, 5, 1, 0, 0, 0, 0));
}

function inScope(d) {
  if (!d || Number.isNaN(new Date(d).getTime())) return false;
  if (!FIRST_YEAR) return true;
  return yearOf(d) >= FIRST_YEAR;
}

function janMayFilter(field) {
  return {
    $expr: {
      $and: [
        { $lte: [{ $month: `$${field}` }, 5] },
        ...(FIRST_YEAR ? [{ $gte: [{ $year: `$${field}` }, FIRST_YEAR] }] : []),
      ],
    },
  };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }

  const dbName = process.env.MONGO_BACKUP_DB_NAME || undefined;
  await mongoose.connect(process.env.MONGODB_URI, dbName ? { dbName } : {});
  const db = mongoose.connection.db;
  console.log(`Database: ${db.databaseName}`);
  if (FIRST_YEAR) console.log(`Scope: year >= ${FIRST_YEAR}`);
  console.log("");

  const payments = db.collection("payments");
  const expenses = db.collection("expenses");
  const snacks = db.collection("snacks");
  const members = db.collection("members");

  const paymentCount = await payments.countDocuments(janMayFilter("month"));
  const expenseCount = await expenses.countDocuments(janMayFilter("date"));
  const snackCount = await snacks.countDocuments(janMayFilter("date"));

  const memberCursor = members.find({});
  let memberJanMay = 0;
  for await (const m of memberCursor) {
    const jd = m.joiningDate ? new Date(m.joiningDate) : null;
    if (jd && inScope(jd) && isJanThroughMay(jd)) memberJanMay += 1;
  }

  console.log("Jan–May records (these pull the month picker backward):");
  console.log(`  payments (month):     ${paymentCount}`);
  console.log(`  expenses (date):      ${expenseCount}`);
  console.log(`  snacks (date):        ${snackCount}`);
  console.log(`  members (joiningDate): ${memberJanMay}`);
  console.log("");

  if (!APPLY_DELETE && !APPLY_CLAMP_JOINING) {
    console.log("Dry-run only. To change data, re-run with:");
    console.log("  --apply-delete          remove Jan–May payments/expenses/snacks");
    console.log("  --apply-clamp-joining   joiningDate Jan–May -> 1 June (same year)");
    await mongoose.disconnect();
    return;
  }

  if (APPLY_DELETE) {
    const pr = await payments.deleteMany(janMayFilter("month"));
    const er = await expenses.deleteMany(janMayFilter("date"));
    const sr = await snacks.deleteMany(janMayFilter("date"));
    console.log("Deleted:");
    console.log(`  payments:  ${pr.deletedCount}`);
    console.log(`  expenses:  ${er.deletedCount}`);
    console.log(`  snacks:    ${sr.deletedCount}`);
  }

  if (APPLY_CLAMP_JOINING) {
    let updated = 0;
    for await (const m of members.find({})) {
      const jd = m.joiningDate ? new Date(m.joiningDate) : null;
      if (!jd || !inScope(jd) || !isJanThroughMay(jd)) continue;
      await members.updateOne(
        { _id: m._id },
        { $set: { joiningDate: juneFirstUtc(yearOf(jd)) } }
      );
      updated += 1;
    }
    console.log(`Members joiningDate clamped to 1 June: ${updated}`);
  }

  console.log("\nReload the admin app. Month navigation should stop at June (earliest remaining data).");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err?.message || err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
