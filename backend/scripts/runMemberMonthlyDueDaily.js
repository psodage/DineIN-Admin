const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { runMemberMonthlyDueDailyJob } = require("../jobs/memberMonthlyDueDailyJob");

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");
  const result = await runMemberMonthlyDueDailyJob(new Date());
  console.log("Daily due result:", result);
  await mongoose.disconnect();
  console.log("Done");
}

run().catch(async (err) => {
  console.error("Daily due run failed:", err?.message || err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
