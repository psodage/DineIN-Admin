function norm(s) {
  return String(s || "").trim();
}

function displayStatusMr(language, statusEn, statusMr) {
  const en = norm(statusEn) || "Active";
  const mr = norm(statusMr);
  if (String(language) === "mr") return mr || (en === "Inactive" ? "निष्क्रिय" : "सक्रिय");
  return en;
}

function displayMealPlanMr(language, mealPlanEn, mealPlanMr) {
  const en = norm(mealPlanEn) || "Lunch";
  const mr = norm(mealPlanMr);
  if (String(language) === "mr") {
    if (mr) return mr;
    if (en === "Dinner") return "रात्रीचे";
    if (en === "Both") return "दोन्ही";
    return "दुपारचे";
  }
  return en;
}

function formatPollQuestion(poll, language) {
  if (!poll || typeof poll !== "object") return "";
  if (String(language) === "mr") return norm(poll.questionMr) || norm(poll.question);
  return norm(poll.question) || norm(poll.questionMr);
}

function formatPollOptionLabel(option, language) {
  if (!option || typeof option !== "object") return "";
  if (String(language) === "mr") return norm(option.labelMr) || norm(option.label);
  return norm(option.label) || norm(option.labelMr);
}

module.exports = {
  displayStatusMr,
  displayMealPlanMr,
  formatPollQuestion,
  formatPollOptionLabel,
};
