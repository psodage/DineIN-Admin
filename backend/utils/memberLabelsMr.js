function statusMrFor(statusEn) {
  const value = String(statusEn || "").trim();
  if (value === "Inactive") return "निष्क्रिय";
  return "सक्रिय";
}

function mealPlanMrFor(mealPlanEn) {
  const value = String(mealPlanEn || "").trim();
  if (value === "Dinner") return "रात्रीचे";
  if (value === "Both") return "दोन्ही";
  return "दुपारचे";
}

module.exports = {
  statusMrFor,
  mealPlanMrFor,
};
