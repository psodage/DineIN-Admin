/**
 * Canonical default mess menu when no entry exists for a date.
 * English + Marathi strings for menuLine / menuDisplayLine helpers.
 */
export const DEFAULT_MESS_MENU = {
  lunch: "Chappati + Bhaji + Amti + Rice",
  lunchMr: "चपाती + भाजी + आमटी + भात",
  dinner: "Chappati + Bhaji + Amti + Rice",
  dinnerMr: "चपाती + भाजी + आमटी + भात",
};

/** Local Thursday (Sun=0 … Thu=4): lighter default dinner. */
const THURSDAY_DEFAULT_DINNER = {
  dinner: "Bhat + Amti",
  dinnerMr: "भात + आमटी",
};

/**
 * Default menu for a calendar day (local timezone). Thursday dinner only is Bhat + Amti.
 * @param {string|number|Date|null|undefined} dateLike
 */
export function getDefaultMessMenuForDate(dateLike) {
  if (dateLike == null) return { ...DEFAULT_MESS_MENU };
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return { ...DEFAULT_MESS_MENU };
  if (d.getDay() !== 4) return { ...DEFAULT_MESS_MENU };
  return { ...DEFAULT_MESS_MENU, ...THURSDAY_DEFAULT_DINNER };
}
