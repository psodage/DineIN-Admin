const express = require("express");
const mongoose = require("mongoose");
const LeaveRequest = require("../models/LeaveRequest");
const LeaveStat = require("../models/LeaveStat");
const Member = require("../models/Member");
const { translateToMarathiIfNeeded } = require("../utils/translateEnToMr");
const { statusMrFor } = require("../utils/memberLabelsMr");
const {
  authenticate,
  requireMember,
  requireAdmin,
  ensureSelfParam,
  ensureSelfBody,
} = require("../middleware/authMiddleware");

const router = express.Router();

// Helper to validate and normalize dates
function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

// Helper to normalize month to first day (YYYY-MM-01)
function getMonthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatYMDLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Expand inclusive [start, end] into YYYY-MM-DD strings intersecting [rangeStart, rangeEnd]. */
function collectLeaveDaysInRange(start, end, rangeStart, rangeEnd) {
  const out = new Set();
  let cur = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate()
  );
  const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const rs = new Date(
    rangeStart.getFullYear(),
    rangeStart.getMonth(),
    rangeStart.getDate()
  );
  const re = new Date(
    rangeEnd.getFullYear(),
    rangeEnd.getMonth(),
    rangeEnd.getDate()
  );
  while (cur <= endOnly) {
    if (cur >= rs && cur <= re) {
      out.add(formatYMDLocal(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * GET /api/leave/stat/:memberId/current
 * Returns LeaveStat for current month (inactiveDays + totalMessBill).
 */
router.get(
  "/stat/:memberId/current",
  authenticate,
  requireMember,
  ensureSelfParam("memberId"),
  async (req, res) => {
  try {
    const { memberId } = req.params;
    if (!memberId) {
      return res.status(400).json({ message: "memberId is required" });
    }

    const monthStart = getMonthStart(new Date());
    const stat = await LeaveStat.findOne({ memberId, month: monthStart }).lean();

    return res.json({
      memberId,
      month: monthStart,
      inactiveDays: Number(stat?.inactiveDays || 0),
    });
  } catch (error) {
    console.error("Get leave stat error:", error);
    return res.status(500).json({ message: "Failed to fetch leave stats" });
  }
  }
);

/**
 * GET /api/leave/member/:memberId?month=YYYY-MM
 * Admin: approved leave calendar days for the member in that month.
 * Response: [{ date: "2026-03-05" }, ...]
 */
router.get(
  "/member/:memberId",
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { memberId } = req.params;
      const monthStr = String(req.query.month || "").trim();

      if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) {
        return res.status(400).json({ message: "Invalid memberId" });
      }

      const member = await Member.findById(memberId).lean();
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      let y;
      let m0;
      if (/^\d{4}-\d{2}$/.test(monthStr)) {
        const parts = monthStr.split("-");
        y = Number(parts[0]);
        m0 = Number(parts[1]) - 1;
      } else {
        const now = new Date();
        y = now.getFullYear();
        m0 = now.getMonth();
      }

      const monthStart = new Date(y, m0, 1);
      const monthEnd = new Date(y, m0 + 1, 0);

      const leaves = await LeaveRequest.find({
        memberId,
        type: "Leave",
        status: "Approved",
        startDate: { $lte: monthEnd },
        endDate: { $gte: monthStart },
      })
        .select("startDate endDate")
        .lean();

      const daySet = new Set();
      for (const leave of leaves) {
        const s = parseDate(leave.startDate);
        const e = parseDate(leave.endDate);
        if (!s || !e) continue;
        const days = collectLeaveDaysInRange(s, e, monthStart, monthEnd);
        days.forEach((d) => daySet.add(d));
      }

      const sorted = Array.from(daySet).sort();
      res.json(sorted.map((date) => ({ date })));
    } catch (error) {
      console.error("Get member leave calendar error:", error);
      res.status(500).json({ message: "Failed to fetch leave calendar" });
    }
  }
);

// POST /api/leave/apply - student submits leave
router.post(
  "/apply",
  authenticate,
  requireMember,
  // memberId is sometimes sent as memberId or studentId by the app
  (req, res, next) => {
    const memberId = req.body.memberId || req.body.studentId;
    if (!memberId) {
      return res.status(400).json({ message: "memberId is required" });
    }
    if (String(memberId) !== String(req.auth.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  },
  async (req, res) => {
  try {
    const memberId = req.body.memberId || req.body.studentId;
      const { startDate, endDate, reason, reasonMr, type } = req.body;

    if (!memberId || !startDate || !endDate) {
      return res.status(400).json({
        message: "memberId, startDate and endDate are required",
      });
    }

    const start = parseDate(startDate);
    const end = parseDate(endDate);

    if (!start || !end) {
      return res.status(400).json({ message: "Invalid start or end date" });
    }

    if (end < start) {
      return res
        .status(400)
        .json({ message: "End date must be on or after start date" });
    }

    const member = await Member.findById(memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

      const resolvedReason = reason ? String(reason).trim() : "";
      const resolvedReasonMrInput =
        reasonMr !== undefined ? String(reasonMr).trim() : resolvedReason;

      const resolvedReasonMr = await translateToMarathiIfNeeded({
        enText: resolvedReason,
        mrText: resolvedReasonMrInput,
      });

      const leave = await LeaveRequest.create({
      memberId: member._id,
      roomNumber: member.roomOwnerName || member.roomNumber || "",
      startDate: start,
      endDate: end,
        reason: resolvedReason,
        reasonMr: resolvedReasonMr || "",
      type: type === "Activation" ? "Activation" : "Leave",
      status: "Pending",
    });

    res.status(201).json(leave);
  } catch (error) {
    console.error("Apply leave error:", error);
    res.status(500).json({ message: "Failed to apply leave" });
  }
  }
);

/**
 * POST /api/leave/apply-simple
 * Member taps "apply leave" once for TODAY.
 *
 * Business rule:
 * - Only streaks of >= 5 consecutive leave days in a month affect billing.
 * - When a streak reaches 5 days, all 5 days are counted into inactiveDays
 *   at once. Further consecutive days (6,7,...) each add 1 more inactive day.
 * - Short streaks (<5 days) are never counted.
 */
router.post(
  "/apply-simple",
  authenticate,
  requireMember,
  ensureSelfBody("memberId"),
  async (req, res) => {
  try {
    const memberId = req.body.memberId;
    if (!memberId) {
      return res.status(400).json({ message: "memberId is required" });
    }

    const member = await Member.findById(memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    const today = new Date();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const monthStart = getMonthStart(today);

    let stat = await LeaveStat.findOne({
      memberId: member._id,
      month: monthStart,
    });

    if (!stat) {
      stat = new LeaveStat({
        memberId: member._id,
        month: monthStart,
        inactiveDays: 0,
        lastLeaveDate: null,
        currentStreak: 0,
      });
    }

    // Determine if today continues a streak (yesterday was also leave)
    const last = stat.lastLeaveDate ? new Date(stat.lastLeaveDate) : null;
    let streak = Number(stat.currentStreak || 0);

    const isYesterday =
      last &&
      last.getFullYear() === todayDateOnly.getFullYear() &&
      last.getMonth() === todayDateOnly.getMonth() &&
      last.getDate() === todayDateOnly.getDate() - 1;

    if (isYesterday) {
      streak += 1;
    } else {
      // New streak starting today
      streak = 1;
    }

    // Only streaks >= 5 days should contribute to inactiveDays
    let deltaInactive = 0;
    if (streak === 5) {
      // First time we hit 5 consecutive days: count all 5 at once
      deltaInactive = 5;
    } else if (streak > 5) {
      // Day 6,7,... each add one more inactive day
      deltaInactive = 1;
    }

    stat.currentStreak = streak;
    stat.lastLeaveDate = todayDateOnly;
    stat.inactiveDays += deltaInactive;

    await stat.save();

    return res.status(201).json(stat);
  } catch (error) {
    console.error("Simple leave apply error:", error);
    return res.status(500).json({ message: "Failed to apply leave" });
  }
  }
);

// GET /api/leave/student/:id - get student's leave history
router.get(
  "/student/:id",
  authenticate,
  requireMember,
  ensureSelfParam("id"),
  async (req, res) => {
  try {
    const { id } = req.params;
    const leaves = await LeaveRequest.find({ memberId: id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(leaves);
  } catch (error) {
    console.error("Get student leaves error:", error);
    res.status(500).json({ message: "Failed to fetch leave history" });
  }
  }
);

// GET /api/leave/all - admin fetches all leave requests
router.get("/all", async (req, res) => {
  try {
    const monthStart = getMonthStart(new Date());

    let leaves = await LeaveRequest.find({})
      .sort({ createdAt: -1 })
      .populate(
        "memberId",
        "name nameMr rollNumber roomOwnerName roomOwnerNameMr phone status statusMr mealPlan mealPlanMr"
      )
      .lean();

    const memberIds = Array.from(
      new Set(
        leaves
          .map((l) => l.memberId && l.memberId._id)
          .filter((id) => !!id)
          .map((id) => String(id))
      )
    );

    if (memberIds.length > 0) {
      const stats = await LeaveStat.find({
        memberId: { $in: memberIds },
        month: monthStart,
      }).lean();

      const statMap = new Map(
        stats.map((s) => [String(s.memberId), Number(s.inactiveDays || 0)])
      );

      leaves = leaves.map((l) => {
        const sid = l.memberId && l.memberId._id;
        const key = sid ? String(sid) : null;
        return {
          ...l,
          currentInactiveDays: key ? statMap.get(key) || 0 : 0,
        };
      });
    }

    res.json(leaves);
  } catch (error) {
    console.error("Get all leaves error:", error);
    res.status(500).json({ message: "Failed to fetch leave requests" });
  }
});

// PUT /api/leave/approve/:id - admin approves leave
router.put("/approve/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const leave = await LeaveRequest.findById(id);
    if (!leave) {
      return res.status(404).json({ message: "Leave request not found" });
    }

    // Approve idempotently
    if (leave.status !== "Approved") {
      leave.status = "Approved";
    }

    // Activation request -> activate member (enable app)
    if (leave.type === "Activation" && leave.memberId) {
      try {
        const member = await Member.findById(leave.memberId);
        if (member && member.status !== "Active") {
          member.status = "Active";
          member.statusMr = statusMrFor("Active");
          await member.save();
        }
      } catch (memberError) {
        console.error("Failed to update member status on activation approve:", memberError);
      }
    }

    // Leave request -> mark member inactive (disable app)
    if (leave.type === "Leave" && leave.memberId) {
      try {
        const member = await Member.findById(leave.memberId);
        if (member && member.status !== "Inactive") {
          member.status = "Inactive";
          member.statusMr = statusMrFor("Inactive");
          await member.save();
        }

        // Billing rule: only Leave requests with duration >= 5 days contribute to inactiveDays.
        // Apply billing only once per leave request.
        if (member && !leave.billingApplied) {
          const start = new Date(leave.startDate);
          const end = new Date(leave.endDate);
          const startDateOnly = new Date(
            start.getFullYear(),
            start.getMonth(),
            start.getDate()
          );
          const endDateOnly = new Date(
            end.getFullYear(),
            end.getMonth(),
            end.getDate()
          );

          if (!isNaN(startDateOnly.getTime()) && !isNaN(endDateOnly.getTime()) && endDateOnly >= startDateOnly) {
            const MS_DAY = 24 * 60 * 60 * 1000;
            const totalDays =
              Math.floor((endDateOnly - startDateOnly) / MS_DAY) + 1;

            leave.billingDaysTotal = totalDays;

            if (totalDays >= 5) {
              const breakdown = [];

              // Split across months
              let cursor = new Date(
                startDateOnly.getFullYear(),
                startDateOnly.getMonth(),
                1
              );
              const lastMonth = new Date(
                endDateOnly.getFullYear(),
                endDateOnly.getMonth(),
                1
              );

              while (cursor <= lastMonth) {
                const monthStart = new Date(
                  cursor.getFullYear(),
                  cursor.getMonth(),
                  1
                );
                const monthEndExclusive = new Date(monthStart);
                monthEndExclusive.setMonth(monthEndExclusive.getMonth() + 1);

                const segStart = startDateOnly > monthStart ? startDateOnly : monthStart;
                const segEnd = endDateOnly < new Date(monthEndExclusive - 1) ? endDateOnly : new Date(monthEndExclusive - 1);

                if (segEnd >= segStart) {
                  const days =
                    Math.floor((segEnd - segStart) / MS_DAY) + 1;

                  breakdown.push({ month: monthStart, days });

                  await LeaveStat.findOneAndUpdate(
                    { memberId: member._id, month: monthStart },
                    {
                      $setOnInsert: {
                      },
                      $inc: { inactiveDays: days },
                    },
                    { upsert: true, new: false }
                  );
                }

                cursor.setMonth(cursor.getMonth() + 1);
              }

              leave.billingDaysByMonth = breakdown;
            } else {
              leave.billingDaysByMonth = [];
            }
          }

          leave.billingApplied = true;
        }
      } catch (memberError) {
        console.error("Failed to update member status on leave approve:", memberError);
      }
    }

    await leave.save();
    res.json(leave);
  } catch (error) {
    console.error("Approve leave error:", error);
    res.status(500).json({ message: "Failed to approve leave request" });
  }
});

// PUT /api/leave/reject/:id - admin rejects leave
router.put("/reject/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const leave = await LeaveRequest.findById(id);
    if (!leave) {
      return res.status(404).json({ message: "Leave request not found" });
    }

    leave.status = "Rejected";
    await leave.save();

    res.json(leave);
  } catch (error) {
    console.error("Reject leave error:", error);
    res.status(500).json({ message: "Failed to reject leave request" });
  }
});

module.exports = router;

