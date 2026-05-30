import { FIRST_SELECTABLE_YEAR } from "../config";

/** 0-based month index; June = 5. Jan–May are not navigable (except current month when today is Jan–May). */
export const JUNE_MONTH_INDEX = 5;

export function getCurrentYearMonth(monthOffset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + monthOffset);
  return d.getFullYear() * 12 + d.getMonth();
}

export function getPolicyMinYearMonth() {
  return FIRST_SELECTABLE_YEAR * 12 + JUNE_MONTH_INDEX;
}

export function getMaxSelectableYearMonth() {
  return getCurrentYearMonth(0);
}

export function isBeforeJuneYearMonth(yearMonth) {
  return yearMonth % 12 < JUNE_MONTH_INDEX;
}

/** Snap Jan–May to June of the same calendar year. */
export function snapToJuneYearMonth(yearMonth) {
  const year = Math.floor(yearMonth / 12);
  const monthIdx = yearMonth % 12;
  if (monthIdx >= JUNE_MONTH_INDEX) return yearMonth;
  return year * 12 + JUNE_MONTH_INDEX;
}

/**
 * Earliest month the user can navigate to: policy floor (June of first year) and optional data floor.
 */
export function combineMinYearMonth(dataMinYearMonth) {
  const policyMin = getPolicyMinYearMonth();
  if (dataMinYearMonth == null || Number.isNaN(dataMinYearMonth)) {
    return policyMin;
  }
  const dataMin = isBeforeJuneYearMonth(dataMinYearMonth)
    ? snapToJuneYearMonth(dataMinYearMonth)
    : dataMinYearMonth;
  return Math.max(policyMin, dataMin);
}

export function clampYearMonthToSelectableWindow(
  yearMonth,
  minYearMonth,
  maxYearMonth = getMaxSelectableYearMonth()
) {
  const minYm = minYearMonth ?? getPolicyMinYearMonth();
  const maxYm = maxYearMonth ?? getMaxSelectableYearMonth();
  const currentYm = getMaxSelectableYearMonth();

  let value = yearMonth;
  if (value > maxYm) value = maxYm;
  if (value < minYm) value = minYm;
  if (value !== currentYm && isBeforeJuneYearMonth(value)) {
    value = snapToJuneYearMonth(value);
  }
  if (value < minYm) value = minYm;
  if (value > maxYm) value = maxYm;
  return value;
}

export function stepPrevYearMonth(yearMonth, floorYearMonth) {
  const monthIdx = yearMonth % 12;
  const year = Math.floor(yearMonth / 12);
  const floorYm = floorYearMonth ?? getPolicyMinYearMonth();

  let next;
  if (monthIdx < JUNE_MONTH_INDEX) {
    next = (year - 1) * 12 + JUNE_MONTH_INDEX;
  } else if (monthIdx === JUNE_MONTH_INDEX) {
    next = (year - 1) * 12 + JUNE_MONTH_INDEX;
  } else {
    next = yearMonth - 1;
  }

  if (next < floorYm) return floorYm;
  if (next !== getMaxSelectableYearMonth() && isBeforeJuneYearMonth(next)) {
    next = snapToJuneYearMonth(next);
  }
  return next < floorYm ? floorYm : next;
}

export function stepNextYearMonth(yearMonth, ceilingYearMonth = getMaxSelectableYearMonth()) {
  const monthIdx = yearMonth % 12;
  const year = Math.floor(yearMonth / 12);
  const ceilingYm = ceilingYearMonth ?? getMaxSelectableYearMonth();

  let next;
  if (monthIdx === 11) {
    next = (year + 1) * 12 + JUNE_MONTH_INDEX;
  } else if (monthIdx >= JUNE_MONTH_INDEX) {
    next = yearMonth + 1;
  } else {
    next = year * 12 + JUNE_MONTH_INDEX;
  }

  if (next > ceilingYm) return ceilingYm;
  return next;
}

export function yearMonthToDate(yearMonth) {
  const year = Math.floor(yearMonth / 12);
  const month = yearMonth % 12;
  return new Date(year, month, 1);
}

export function dateToYearMonth(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.getFullYear() * 12 + d.getMonth();
}

export function shiftMemberMonthDate(baseMonth, offset, minMonth, maxMonth) {
  if (!(baseMonth instanceof Date) || Number.isNaN(baseMonth.getTime())) {
    return maxMonth instanceof Date ? maxMonth : new Date();
  }
  const minYm =
    minMonth instanceof Date && !Number.isNaN(minMonth.getTime())
      ? dateToYearMonth(minMonth)
      : getPolicyMinYearMonth();
  const maxYm =
    maxMonth instanceof Date && !Number.isNaN(maxMonth.getTime())
      ? dateToYearMonth(maxMonth)
      : getMaxSelectableYearMonth();

  let ym = dateToYearMonth(baseMonth);
  const steps = offset < 0 ? -1 : 1;
  const count = Math.abs(offset);
  for (let i = 0; i < count; i += 1) {
    ym = steps < 0 ? stepPrevYearMonth(ym, minYm) : stepNextYearMonth(ym, maxYm);
  }
  return yearMonthToDate(ym);
}
