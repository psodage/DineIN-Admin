// wipeData.js (run with `node backend/dat_wp.js`)
// Deletes existing documents in MongoDB without touching your `/backend/models/*` code.
//
// IMPORTANT: this deletes data. It is destructive.

import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

async function wipe(db, name, filter = {}) {
  const res = await db.collection(name).deleteMany(filter);
  console.log(`${name}: deleted ${res.deletedCount}`);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI in backend/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // wipe collections that depend on the normalized schemas
  await wipe(db, "members");
  await wipe(db, "snackorders");
  await wipe(db, "payments");
  await wipe(db, "leaverequests");
  await wipe(db, "leaves");
  await wipe(db, "dues");
  await wipe(db, "expenses");
  await wipe(db, "billsplitrequests");
  await wipe(db, "menus");
  // reset sequences / counters
  await wipe(db, "counters");

  // clean logs + temp collections
  await wipe(db, "monthlybillemaillogs");
  await wipe(db, "polls");
  await wipe(db, "otps");

  // keep admin auth users; remove only member auth users
  await wipe(db, "users", { role: "member" });

  // optional: if old collection still exists
  await wipe(db, "students");

  await mongoose.disconnect();
  console.log("Wipe done.");
}

main().catch((err) => {
  console.error("Wipe failed:", err);
  process.exit(1);
});