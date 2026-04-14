const MealType = require("../models/MealType");

const DEFAULT_MEAL_TYPES = [
  { mealPlan: "Both", price: 3000 },
  { mealPlan: "Dinner", price: 1800 },
  { mealPlan: "Lunch", price: 1800 },
];

async function seedMealTypes() {
  for (const row of DEFAULT_MEAL_TYPES) {
    await MealType.findOneAndUpdate(
      { mealPlan: row.mealPlan },
      { $set: { price: row.price } },
      { upsert: true, new: false, setDefaultsOnInsert: true }
    );
  }
}

module.exports = {
  seedMealTypes,
  DEFAULT_MEAL_TYPES,
};
