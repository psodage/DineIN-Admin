const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Member = require("../models/Member");
const MealType = require("../models/MealType");
const { seedMealTypes } = require("../utils/seedMealTypes");

function normalizeMealPlan(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "both") return "Both";
  if (v === "dinner") return "Dinner";
  return "Lunch";
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");

  await seedMealTypes();

  const mealTypes = await MealType.find({})
    .select("_id mealPlan mealPlanMr")
    .lean();
  const mealTypeByPlan = new Map(
    mealTypes.map((m) => [normalizeMealPlan(m.mealPlan), m])
  );

  const members = await Member.find({})
    .select("_id mealPlan mealPlanMr mealTypeId")
    .lean();

  let updated = 0;
  for (const member of members) {
    const plan = normalizeMealPlan(member.mealPlan);
    const mealType = mealTypeByPlan.get(plan) || mealTypeByPlan.get("Lunch");
    if (!mealType) continue;

    const hasSameRef =
      member.mealTypeId && String(member.mealTypeId) === String(mealType._id);
    const hasSameMr = String(member.mealPlanMr || "") === String(mealType.mealPlanMr || "");
    const hasSamePlan = String(member.mealPlan || "") === plan;

    if (hasSameRef && hasSameMr && hasSamePlan) continue;

    await Member.updateOne(
      { _id: member._id },
      {
        $set: {
          mealPlan: plan,
          mealPlanMr: mealType.mealPlanMr || "",
          mealTypeId: mealType._id,
        },
      }
    );
    updated += 1;
  }

  console.log(`Members scanned: ${members.length}`);
  console.log(`Members updated: ${updated}`);
  await mongoose.disconnect();
  console.log("Migration complete");
}

run().catch(async (err) => {
  console.error("Migration failed:", err?.message || err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
