const Member = require("../models/Member");
const SnackOrder = require("../models/SnackOrder");
const Payment = require("../models/Payment");
const LeaveRequest = require("../models/LeaveRequest");
const LeaveStat = require("../models/LeaveStat");
const Expense = require("../models/Expense");
const MealType = require("../models/MealType");

function getMonthRange(monthDate) {
  const d = monthDate instanceof Date ? monthDate : new Date(monthDate);
  if (Number.isNaN(d.getTime())) return null;

  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const endExclusive = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, endExclusive };
}

function getDaysInMonth(d) {
  // Month rollover trick: day 0 of next month is last day of current.
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

const DEFAULT_MEAL_PLAN_PRICE = {
  Both: 3000,
  Dinner: 1800,
  Lunch: 1800,
};

const DEFAULT_MEAL_PLAN_DAILY_RATE = {
  Both: 100,
  Dinner: 60,
  Lunch: 60,
};

async function mealPlanToDailyRate(mealPlan, monthDate) {
  const normalized = String(mealPlan || "Lunch").trim();
  const plan = ["Lunch", "Dinner", "Both"].includes(normalized)
    ? normalized
    : "Lunch";
  // Requirement: fixed per-day charge by meal plan.
  // Both => 100/day, Lunch/Dinner => 60/day.
  // Keep MealType lookup for compatibility/future use, but do not
  // divide monthly price by calendar days for due calculation.
  const configuredDailyRate = Number(
    DEFAULT_MEAL_PLAN_DAILY_RATE[plan] ?? DEFAULT_MEAL_PLAN_DAILY_RATE.Lunch
  );
  if (Number.isFinite(configuredDailyRate) && configuredDailyRate > 0) {
    return configuredDailyRate;
  }

  const monthDays = getDaysInMonth(monthDate instanceof Date ? monthDate : new Date());
  const priceDoc = await MealType.findOne({ mealPlan: plan }).select("price").lean();
  const monthlyPrice = Number(
    priceDoc?.price ?? DEFAULT_MEAL_PLAN_PRICE[plan] ?? DEFAULT_MEAL_PLAN_PRICE.Lunch
  );
  return monthlyPrice / Math.max(1, monthDays);
}

function parseDayKeyLocal(key) {
  const m = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d, 0, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function countDaysInclusiveLocal(startDateOnly, endDateOnlyInclusive) {
  if (!startDateOnly || !endDateOnlyInclusive) return 0;
  const start = toDateOnlyLocal(startDateOnly);
  const end = toDateOnlyLocal(endDateOnlyInclusive);
  if (end.getTime() < start.getTime()) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateOnlyLocal(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayKeyLocal(d) {
  const dd = toDateOnlyLocal(d);
  return `${dd.getFullYear()}-${pad2(dd.getMonth() + 1)}-${pad2(dd.getDate())}`;
}

function addDaysLocal(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function isSameOrAfter(dateA, dateB) {
  return dateA.getTime() >= dateB.getTime();
}

function isBefore(dateA, dateB) {
  return dateA.getTime() < dateB.getTime();
}

async function computeApprovedLeaveDayKeysForMonth(memberId, monthStart) {
  const range = getMonthRange(monthStart);
  if (!range) return { approvedLeaveDayKeys: [] };
  const monthKeyStart = new Date(range.start.getFullYear(), range.start.getMonth(), 1);

  const stat = await LeaveStat.findOne({
    memberId,
    month: monthKeyStart,
  })
    .select("chargeableLeaveDayKeys shortLeaveDayKeys")
    .lean();
  const statChargeable = Array.isArray(stat?.chargeableLeaveDayKeys)
    ? stat.chargeableLeaveDayKeys
    : [];
  const statShort = Array.isArray(stat?.shortLeaveDayKeys) ? stat.shortLeaveDayKeys : [];
  if (statChargeable.length > 0 || statShort.length > 0) {
    return {
      approvedLeaveDayKeys: Array.from(new Set(statChargeable)),
    };
  }

  const monthEndInclusive = addDaysLocal(range.endExclusive, -1);

  const approvedLeaves = await LeaveRequest.find({
    memberId,
    status: "Approved",
    type: "Leave",
    startDate: { $lte: range.endExclusive },
    endDate: { $gte: range.start },
  }).lean();

  const set = new Set();

  for (const leave of approvedLeaves) {
    const reqStart = toDateOnlyLocal(new Date(leave.startDate));
    const reqEnd = toDateOnlyLocal(new Date(leave.endDate));
    if (Number.isNaN(reqStart.getTime()) || Number.isNaN(reqEnd.getTime())) continue;

    const clippedStart =
      reqStart.getTime() > range.start.getTime() ? reqStart : range.start;
    const clippedEnd =
      reqEnd.getTime() < monthEndInclusive.getTime() ? reqEnd : monthEndInclusive;

    if (clippedEnd.getTime() < clippedStart.getTime()) continue;

    for (
      let day = new Date(clippedStart);
      day.getTime() <= clippedEnd.getTime();
      day = addDaysLocal(day, 1)
    ) {
      set.add(dayKeyLocal(day));
    }
  }

  return { approvedLeaveDayKeys: Array.from(set) };
}

async function calculateSnackTotalForMonth(memberId, monthDate) {
  const range = getMonthRange(monthDate);
  if (!range) return 0;

  const orders = await SnackOrder.find({
    memberId,
    isOutsideCustomer: false,
    date: { $gte: range.start, $lt: range.endExclusive },
  })
    .populate("snackId", "name price category")
    .lean();

  return orders.reduce((sum, o) => {
    const charged = Number(o?.chargedAmount);
    if (Number.isFinite(charged)) return sum + charged;
    const price = Number(o?.snackId?.price || 0);
    const qty = Number(o?.quantity || 0);
    return sum + qty * price;
  }, 0);
}

async function calculateExpenseShareForMonth(memberId, monthDate) {
  const range = getMonthRange(monthDate);
  if (!range) return 0;

  const monthStart = range.start;
  const monthDays = getDaysInMonth(monthStart);

  const members = await Member.find({
    joiningDate: { $lte: range.endExclusive },
  })
    .select("_id mealPlan joiningDate")
    .lean();

  if (!members.length) return 0;

  const memberIds = members.map((m) => m._id);
  const totalExpensesAgg = await Expense.aggregate([
    {
      $match: {
        date: { $gte: range.start, $lt: range.endExclusive },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  const totalExpenses = Number(totalExpensesAgg?.[0]?.total || 0);
  if (totalExpenses <= 0) return 0;

  // Weighted by effective charged days and daily rate (Both vs Lunch/Dinner).
  let totalEffectiveRate = 0;
  const effectiveRateByMember = new Map();

  for (const m of members) {
    const dailyRate = await mealPlanToDailyRate(m.mealPlan, monthStart);
    // For expense shares, exclude approved leave days from weight as well.
    const { approvedLeaveDayKeys } = await computeApprovedLeaveDayKeysForMonth(
      m._id,
      monthStart
    );
    const approvedLeaveDays = Array.isArray(approvedLeaveDayKeys)
      ? approvedLeaveDayKeys.length
      : 0;
    const effectiveDaysCharged = Math.max(0, monthDays - approvedLeaveDays);
    const effectiveRate = dailyRate * effectiveDaysCharged;
    effectiveRateByMember.set(String(m._id), effectiveRate);
    totalEffectiveRate += effectiveRate;
  }

  if (totalEffectiveRate <= 0) return 0;

  const memberEffectiveRate = Number(effectiveRateByMember.get(String(memberId)) || 0);
  return totalExpenses * (memberEffectiveRate / totalEffectiveRate);
}

async function calculateMemberBilling(memberId, monthDate, options = {}) {
  const range = getMonthRange(monthDate);
  if (!range) return null;

  const member = await Member.findById(memberId).lean();
  if (!member) return null;

  // If member joined after the billing window, charge 0.
  if (member.joiningDate && member.joiningDate >= range.endExclusive) {
    return {
      memberId,
      month: range.start,
      inactiveDays: 0,
      chargeableLeaveDayKeys: [],
      chargeableLeaveDays: 0,
      dailyRate: await mealPlanToDailyRate(member.mealPlan, range.start),
      mealAmount: 0,
      snacksAmount: 0,
      expenseShare: 0,
      totalBill: 0,
      paidAmount: 0,
      remainingAmount: 0,
      status: "Paid",
    };
  }

  // MemberActivityCalendar-style leave days: count ALL approved leave days in that month.
  // Also do not count future days for the current month.
  const overrideLeaveDayKeys = Array.isArray(options?.approvedLeaveDayKeys)
    ? options.approvedLeaveDayKeys
    : null;
  const { approvedLeaveDayKeys } = overrideLeaveDayKeys
    ? { approvedLeaveDayKeys: overrideLeaveDayKeys }
    : await computeApprovedLeaveDayKeysForMonth(memberId, range.start);

  const dailyRate = await mealPlanToDailyRate(member.mealPlan, range.start);
  // Monthly Due Payment (as per requirement):
  // mealAmount = activeDays * dailyRate, where:
  // - activeDays = eligibleDaysInMonth - approvedLeaveDaysInMonth
  const monthStart = range.start;
  const monthEndInclusive = addDaysLocal(range.endExclusive, -1);
  const joinDateOnly = member.joiningDate ? toDateOnlyLocal(new Date(member.joiningDate)) : null;
  const eligibleStart =
    joinDateOnly && joinDateOnly.getTime() > monthStart.getTime() ? joinDateOnly : monthStart;

  const isCurrentMonth =
    new Date().getFullYear() === monthStart.getFullYear() &&
    new Date().getMonth() === monthStart.getMonth();
  const maxEligibleEnd = isCurrentMonth ? toDateOnlyLocal(new Date()) : monthEndInclusive;
  const eligibleEnd =
    maxEligibleEnd.getTime() < monthEndInclusive.getTime() ? maxEligibleEnd : monthEndInclusive;

  const eligibleDays = countDaysInclusiveLocal(eligibleStart, eligibleEnd);

  const approvedEligibleLeaveDays = (approvedLeaveDayKeys || []).reduce((acc, key) => {
    const d = parseDayKeyLocal(key);
    if (!d) return acc;
    if (d.getTime() < eligibleStart.getTime()) return acc;
    if (d.getTime() > eligibleEnd.getTime()) return acc;
    return acc + 1;
  }, 0);

  const activeDays = Math.max(0, eligibleDays - approvedEligibleLeaveDays);
  const mealAmount = Math.max(0, activeDays * dailyRate);

  const snacksAmount = await calculateSnackTotalForMonth(memberId, range.start);
  // Requirement: monthly due = snacks + meal(activeDays*dailyRate).
  // Keep expenseShare at 0 in this simplified formula.
  const expenseShare = 0;

  const totalBill = mealAmount + snacksAmount;

  const payments = await Payment.find({
    memberId,
    month: { $gte: range.start, $lt: range.endExclusive },
  })
    .select("paidAmount")
    .lean();

  const paidAmount = payments.reduce((sum, p) => sum + Number(p.paidAmount || 0), 0);
  const remainingAmount = Math.max(0, totalBill - paidAmount);
  const status = remainingAmount <= 0 ? "Paid" : "Pending";

  return {
    memberId,
    month: range.start,
    inactiveDays: approvedEligibleLeaveDays,
    chargeableLeaveDayKeys: approvedLeaveDayKeys,
    chargeableLeaveDays: approvedEligibleLeaveDays,
    dailyRate,
    mealAmount,
    snacksAmount,
    expenseShare,
    totalBill,
    paidAmount,
    remainingAmount,
    status,
  };
}

module.exports = {
  getMonthRange,
  calculateSnackTotalForMonth,
  calculateExpenseShareForMonth,
  calculateMemberBilling,
};

