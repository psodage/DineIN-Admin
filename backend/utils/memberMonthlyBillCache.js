const Due = require("../models/Due");
const { calculateMemberBilling, getMonthRange } = require("./billing");

async function upsertMemberMonthlyBill(memberId, monthDate) {
  if (!memberId || !monthDate) return null;
  const range = getMonthRange(monthDate);
  if (!range) return null;

  const billing = await calculateMemberBilling(memberId, range.start);
  if (!billing) return null;

  const payload = {
    memberId,
    month: range.start,
    dueAmount: Number(billing.remainingAmount || 0),
    paidAmount: Number(billing.paidAmount || 0),
  };

  await Due.findOneAndUpdate(
    { memberId, month: range.start },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return payload;
}

module.exports = { upsertMemberMonthlyBill };
