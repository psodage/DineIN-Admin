const MealType = require("../models/MealType");

const DEFAULT_MEAL_TYPES = [
  { mealPlan: "Both", mealPlanMr: "दोन्ही", price: 3000 },
  { mealPlan: "Dinner", mealPlanMr: "रात्रीचे जेवण", price: 1800 },
  { mealPlan: "Lunch", mealPlanMr: "दुपारचे जेवण", price: 1800 },
];

async function seedMealTypes() {
  for (const row of DEFAULT_MEAL_TYPES) {
    await MealType.findOneAndUpdate(
      { mealPlan: row.mealPlan },
      { $set: { price: row.price, mealPlanMr: row.mealPlanMr } },
      { upsert: true, new: false, setDefaultsOnInsert: true }
    );
  }
}

module.exports = {
  seedMealTypes,
  DEFAULT_MEAL_TYPES,
};
