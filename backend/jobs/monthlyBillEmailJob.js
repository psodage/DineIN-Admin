const Member = require("../models/Member");
const MonthlyBillEmailLog = require("../models/MonthlyBillEmailLog");
const { sendMonthlyBillEmail } = require("../utils/email");
const { calculateMemberBilling } = require("../utils/billing");
const { upsertMemberMonthlyBill } = require("../utils/memberMonthlyBillCache");

function monthKeyFromDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthLabelFromDate(d) {
  const monthName = d.toLocaleString("en-IN", { month: "short" });
  return `${monthName} ${d.getFullYear()}`;
}

function getPrevMonthRange(now = new Date()) {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const start = new Date(prev.getFullYear(), prev.getMonth(), 1);
  const end = new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
  return { prev, start, end };
}

async function runMonthlyBillEmailJob(now = new Date()) {
  if (now.getDate() !== 1) return { skipped: true, reason: "Not day 1" };

  const hasEmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  if (!hasEmail) return { skipped: true, reason: "Email not configured" };

  const { prev, start, end } = getPrevMonthRange(now);
  const monthKey = monthKeyFromDate(prev);
  const monthLabel = monthLabelFromDate(prev);

  const members = await Member.find({ status: "Active" })
    .populate("userId", "email")
    .select("_id name userId");

  const filteredMembers = (members || []).filter(
    (m) => m?.userId?.email && String(m.userId.email).trim() !== ""
  );

  let sent = 0;
  let alreadySent = 0;
  let failed = 0;

  for (const m of filteredMembers) {
    try {
      const existing = await MonthlyBillEmailLog.findOne({
        memberId: m._id,
        monthKey,
      }).lean();
      if (existing) {
        alreadySent += 1;
        continue;
      }

      const billing = await calculateMemberBilling(m._id, prev);
      const total = Number(billing?.totalBill || 0);
      const paid = Number(billing?.paidAmount || 0);
      const due = Number(billing?.remainingAmount || 0);

      // Keep monthly billing cache updated for fast due display.
      await upsertMemberMonthlyBill(m._id, prev);

      await sendMonthlyBillEmail({
        to: m.userId?.email,
        memberName: m.name,
        monthLabel,
        total,
        paid,
        due,
      });

      await MonthlyBillEmailLog.create({
        memberId: m._id,
        monthKey,
        to: m.userId?.email,
        total,
        paid,
        due,
      });

      sent += 1;
    } catch (err) {
      failed += 1;
      console.error("Monthly bill email failed:", m?.userId?.email, err?.message || err);
    }
  }

  return { skipped: false, monthKey, monthLabel, members: filteredMembers.length, sent, alreadySent, failed };
}

function startMonthlyBillEmailScheduler() {
  // Run shortly after server start (helps if server starts on 1st).
  runMonthlyBillEmailJob(new Date()).then((res) => {
    if (!res?.skipped) {
      console.log("Monthly bill email job:", res);
    } else {
      console.log("Monthly bill email job skipped:", res?.reason);
    }
  });

  // Check once every hour (simple, no extra deps). Only day 1 actually sends.
  setInterval(() => {
    runMonthlyBillEmailJob(new Date()).then((res) => {
      if (!res?.skipped) {
        console.log("Monthly bill email job:", res);
      }
    });
  }, 60 * 60 * 1000);
}

module.exports = {
  runMonthlyBillEmailJob,
  startMonthlyBillEmailScheduler,
};

