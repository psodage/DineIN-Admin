const Member = require("../models/Member");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");
const { calculateMemberBilling } = require("../utils/billing");

function getMonthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

async function runMemberMonthlyDueDailyJob(now = new Date()) {
  const month = getMonthStart(now);

  const members = await Member.find({})
    .select("_id userId mealPlan")
    .lean();

  const memberById = new Map(members.map((m) => [String(m._id), m]));

  let created = 0;
  let recalculated = 0;
  let skippedMissingMember = 0;

  for (const member of members) {
    if (!member?.userId) continue;
    await MemberMonthlyDue.updateOne(
      { memberId: member._id, month },
      {
        $setOnInsert: {
          memberId: member._id,
          userId: member.userId,
          month,
          due: 0,
          status: "Pending",
        },
      },
      { upsert: true }
    );
  }

  const dues = await MemberMonthlyDue.find({ month })
    .select("_id memberId")
    .lean();

  for (const row of dues) {
    const member = memberById.get(String(row.memberId));
    if (!member) {
      skippedMissingMember += 1;
      continue;
    }

    const billing = await calculateMemberBilling(member._id, month);
    if (!billing) continue;
    const nextDue = Math.max(0, Number(billing.remainingAmount || 0));
    const nextCollected = Math.max(0, Number(billing.paidAmount || 0));
    const nextStatus = nextDue <= 0 ? "Paid" : "Pending";

    await MemberMonthlyDue.updateOne(
      { _id: row._id },
      {
        $set: {
          due: nextDue,
          collected: nextCollected,
          status: nextStatus,
          userId: member.userId,
        },
      }
    );
    recalculated += 1;
  }

  created = await MemberMonthlyDue.countDocuments({ month, due: 0, status: "Pending" });

  return {
    month,
    membersScanned: members.length,
    docsForMonth: dues.length,
    recalculated,
    skippedMissingMember,
    pendingZeroDueDocs: created,
  };
}

function startMemberMonthlyDueDailyScheduler() {
  runMemberMonthlyDueDailyJob(new Date())
    .catch((err) => {
      console.error("Member monthly due daily job failed:", err?.message || err);
    });

  setInterval(() => {
    runMemberMonthlyDueDailyJob(new Date())
      .catch((err) => {
        console.error("Member monthly due daily job failed:", err?.message || err);
      });
  }, 60 * 60 * 1000);
}

module.exports = {
  runMemberMonthlyDueDailyJob,
  startMemberMonthlyDueDailyScheduler,
};
