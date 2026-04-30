const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");
  const result = await MemberMonthlyDue.updateMany(
    {},
    { $unset: { chargeableLeaveDayKeys: "" } }
  );
  console.log("Cleanup result:", result);
  await mongoose.disconnect();
  console.log("Cleanup complete");
}

run().catch(async (err) => {
  console.error("Cleanup failed:", err?.message || err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
