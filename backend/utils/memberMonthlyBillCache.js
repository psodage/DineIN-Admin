const Member = require("../models/Member");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");
const { calculateMemberBilling, getMonthRange } = require("./billing");

async function upsertMemberMonthlyBill(memberId, monthDate, options = {}) {
  if (!memberId || !monthDate) return null;
  const { createIfMissing = true } = options || {};
  const range = getMonthRange(monthDate);
  if (!range) return null;

  const member = await Member.findById(memberId).select("userId").lean();
  if (!member?.userId) return null;

  const billing = await calculateMemberBilling(memberId, range.start);
  if (!billing) return null;

  const payload = {
    memberId,
    userId: member.userId,
    due: Number(billing.remainingAmount || 0),
    collected: Number(billing.paidAmount || 0),
    status: Number(billing.remainingAmount || 0) > 0 ? "Pending" : "Paid",
  };

  const existingMonthlyDue = await MemberMonthlyDue.findOne({
    memberId,
    month: { $gte: range.start, $lt: range.endExclusive },
  })
    .select("_id")
    .lean();

  if (existingMonthlyDue?._id) {
    await MemberMonthlyDue.updateOne(
      { _id: existingMonthlyDue._id },
      {
        $set: payload,
      }
    );
    return payload;
  }

  if (!createIfMissing) return null;

  await MemberMonthlyDue.create({
    ...payload,
    month: range.start,
  });

  return payload;
}

module.exports = { upsertMemberMonthlyBill };
