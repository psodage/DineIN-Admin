/** Gregorian month names for admin month pickers and labels (local `yearMonth` index). */

export const MONTH_NAMES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const MONTH_NAMES_MR = [
  "जानेवारी",
  "फेब्रुवारी",
  "मार्च",
  "एप्रिल",
  "मे",
  "जून",
  "जुलै",
  "ऑगस्ट",
  "सप्टेंबर",
  "ऑक्टोबर",
  "नोव्हेंबर",
  "डिसेंबर",
];

export function monthNamesForLanguage(language) {
  return language === "mr" ? MONTH_NAMES_MR : MONTH_NAMES_EN;
}

/**
 * @param {number} yearMonth `year * 12 + monthIndex` (monthIndex 0–11)
 * @param {"en"|"mr"} language
 */
export function getMonthLabel(yearMonth, language = "en") {
  const year = Math.floor(yearMonth / 12);
  const month = yearMonth % 12;
  const names = monthNamesForLanguage(language);
  return `${names[month]} ${year}`;
}

/** Rolling list of months for payment forms (label follows language). */
export function buildMonthOptionList(language = "en") {
  const names = monthNamesForLanguage(language);
  const options = [];
  const now = new Date();
  const TOTAL_MONTHS = 10 * 12;

  for (let i = 0; i < TOTAL_MONTHS; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");

    options.push({
      label: `${names[d.getMonth()]} ${year}`,
      value: `${year}-${month}-01`,
      yearMonth: year * 12 + d.getMonth(),
    });
  }
  return options;
}
