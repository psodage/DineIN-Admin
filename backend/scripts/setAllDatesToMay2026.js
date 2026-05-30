/**
 * Set every Date field (and YYYY-MM-DD / monthKey strings) to May 1, 2026 across all collections.
 *
 *   node scripts/setAllDatesToMay2026.js           # dry-run
 *   node scripts/setAllDatesToMay2026.js --apply
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { ObjectId, Decimal128, Long, Double } = require("mongodb");

const APPLY = process.argv.includes("--apply");

/** Local midnight 1 May 2026 */
const TARGET_DATE = new Date(2026, 4, 1, 0, 0, 0, 0);
const TARGET_DAY_STRING = "2026-05-01";
const TARGET_MONTH_KEY = "2026-05";

const SKIP_COLLECTIONS = new Set([
  "system.views",
  "system.buckets",
  "system.profile",
]);

function isObjectId(value) {
  if (value instanceof ObjectId) return true;
  if (mongoose.Types.ObjectId.isValid(value) && value?.constructor?.name === "ObjectId") {
    return true;
  }
  return false;
}

function isPlainValue(value) {
  if (value == null) return false;
  if (value instanceof Date) return false;
  if (isObjectId(value)) return false;
  if (value instanceof Decimal128 || value instanceof Long || value instanceof Double) return false;
  if (Buffer.isBuffer(value)) return false;
  return typeof value === "object";
}

function buildDateUpdates(value, prefix = "") {
  const sets = {};

  if (value instanceof Date) {
    if (prefix) sets[prefix] = TARGET_DATE;
    return sets;
  }

  if (typeof value === "string" && prefix) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      sets[prefix] = TARGET_DAY_STRING;
    } else if (/^\d{4}-\d{2}$/.test(value) && /monthkey$/i.test(prefix.split(".").pop())) {
      sets[prefix] = TARGET_MONTH_KEY;
    }
    return sets;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const childPrefix = prefix ? `${prefix}.${index}` : String(index);
      Object.assign(sets, buildDateUpdates(item, childPrefix));
    });
    return sets;
  }

  if (isPlainValue(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "_id") continue;
      const childPrefix = prefix ? `${prefix}.${key}` : key;
      Object.assign(sets, buildDateUpdates(child, childPrefix));
    }
  }

  return sets;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }

  const dbName = process.env.MONGO_BACKUP_DB_NAME || undefined;
  await mongoose.connect(process.env.MONGODB_URI, dbName ? { dbName } : {});
  const db = mongoose.connection.db;

  console.log(`Database: ${db.databaseName}`);
  console.log(`Target date: ${TARGET_DATE.toISOString()} (${TARGET_DAY_STRING})`);
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  let totalDocs = 0;
  let totalUpdates = 0;
  let totalFields = 0;

  for (const { name } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    if (name.startsWith("system.") || SKIP_COLLECTIONS.has(name)) continue;

    const coll = db.collection(name);
    const cursor = coll.find({});
    let collectionDocs = 0;
    let collectionUpdates = 0;
    let collectionFields = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      collectionDocs += 1;
      const sets = buildDateUpdates(doc);
      const keys = Object.keys(sets);
      if (keys.length === 0) continue;

      collectionUpdates += 1;
      collectionFields += keys.length;
      totalFields += keys.length;

      if (APPLY) {
        await coll.updateOne({ _id: doc._id }, { $set: sets });
      }
    }

    totalDocs += collectionDocs;
    totalUpdates += collectionUpdates;

    if (collectionUpdates > 0) {
      console.log(
        `${name}: ${collectionDocs} doc(s), ${collectionUpdates} to update, ${collectionFields} date field(s)`
      );
    } else if (collectionDocs > 0) {
      console.log(`${name}: ${collectionDocs} doc(s), no date fields`);
    }
  }

  console.log("\n---");
  console.log(`Documents scanned: ${totalDocs}`);
  console.log(`Documents with date fields: ${totalUpdates}`);
  console.log(`Date fields to set: ${totalFields}`);

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to write changes.");
  } else {
    console.log("\nAll date fields updated to May 1, 2026.");
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err?.message || err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
