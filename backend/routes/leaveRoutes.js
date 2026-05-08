const express = require("express");
const mongoose = require("mongoose");
const LeaveRequest = require("../models/LeaveRequest");
const LeaveStat = require("../models/LeaveStat");
const Member = require("../models/Member");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");
const AppSetting = require("../models/AppSetting");
const { calculateMemberBilling, calculateMemberTotalRemainingDue } = require("../utils/billing");
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

function formatYMDUtc(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMDLocal(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d, 0, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function parseYMDUtc(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d, 0, 0, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

const DEFAULT_LEAVE_STREAK_DAYS = 5;

async function getMinLeaveStreakDays() {
  try {
    const setting = await AppSetting.findOne({
      key: {
        $in: [
          "streak_required_days",
          "leaveMinStreakDays",
          "LEAVE_MIN_STREAK_DAYS",
        ],
      },
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .select("numberValue")
      .lean();
    const value = Number(setting?.numberValue);
    if (Number.isFinite(value) && value >= 1) {
      return Math.floor(value);
    }
  } catch (_err) {
    // Fall back to default when setting lookup fails.
  }
  return DEFAULT_LEAVE_STREAK_DAYS;
}

function splitLeaveKeysByStreak(dayKeys, minStreakDays = DEFAULT_LEAVE_STREAK_DAYS) {
  const parsed = Array.from(
    new Set(
      (Array.isArray(dayKeys) ? dayKeys : [])
        .map((k) => String(k || "").trim())
        .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    )
  )
    .map((key) => ({ key, date: parseYMDLocal(key) }))
    .filter((x) => x.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const chargeable = [];
  const short = [];
  if (!parsed.length) return { chargeable, short };

  let streak = [parsed[0]];
  for (let i = 1; i < parsed.length; i += 1) {
    const prev = streak[streak.length - 1];
    const cur = parsed[i];
    const diffDays = Math.round(
      (cur.date.getTime() - prev.date.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (diffDays === 1) {
      streak.push(cur);
    } else {
      if (streak.length >= minStreakDays) chargeable.push(...streak.map((s) => s.key));
      else short.push(...streak.map((s) => s.key));
      streak = [cur];
    }
  }
  if (streak.length >= minStreakDays) chargeable.push(...streak.map((s) => s.key));
  else short.push(...streak.map((s) => s.key));

  return { chargeable, short };
}

function computeLatestStreakMeta(dayKeys) {
  const parsed = Array.from(
    new Set(
      (Array.isArray(dayKeys) ? dayKeys : [])
        .map((k) => String(k || "").trim())
        .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    )
  )
    .map((key) => parseYMDLocal(key))
    .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (!parsed.length) {
    return { currentStreak: 0, lastLeaveDate: null };
  }

  let streak = 1;
  for (let i = parsed.length - 1; i > 0; i -= 1) {
    const cur = parsed[i];
    const prev = parsed[i - 1];
    const diffDays = Math.round(
      (cur.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (diffDays === 1) streak += 1;
    else break;
  }

  return {
    currentStreak: streak,
    lastLeaveDate: parsed[parsed.length - 1],
  };
}

function buildLeaveStreaks(dayKeys) {
  const parsed = Array.from(
    new Set(
      (Array.isArray(dayKeys) ? dayKeys : [])
        .map((k) => String(k || "").trim())
        .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    )
  )
    .map((key) => ({ key, date: parseYMDLocal(key) }))
    .filter((x) => x.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const streaks = [];
  if (!parsed.length) return streaks;

  let current = [parsed[0]];
  for (let i = 1; i < parsed.length; i += 1) {
    const prev = current[current.length - 1];
    const cur = parsed[i];
    const diffDays = Math.round(
      (cur.date.getTime() - prev.date.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (diffDays === 1) {
      current.push(cur);
    } else {
      streaks.push({
        startKey: current[0].key,
        endKey: current[current.length - 1].key,
        days: current.length,
      });
      current = [cur];
    }
  }
  streaks.push({
    startKey: current[0].key,
    endKey: current[current.length - 1].key,
    days: current.length,
  });
  return streaks;
}

function toDateOnlyLocal(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function toDateOnlyUtc(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function resolveLeaveMemberId(leaveDoc) {
  if (leaveDoc?.memberId) return leaveDoc.memberId;
  const legacyStudentId =
    typeof leaveDoc?.get === "function" ? leaveDoc.get("studentId") : leaveDoc?.studentId;
  if (legacyStudentId) return legacyStudentId;
  return null;
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

      const monthStat = await LeaveStat.findOne({
        memberId,
        month: monthStart,
      })
        .select("chargeableLeaveDayKeys shortLeaveDayKeys")
        .lean();
      const manualDays = [
        ...(Array.isArray(monthStat?.chargeableLeaveDayKeys)
          ? monthStat.chargeableLeaveDayKeys
          : []),
        ...(Array.isArray(monthStat?.shortLeaveDayKeys) ? monthStat.shortLeaveDayKeys : []),
      ];
      manualDays.forEach((d) => {
        if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) daySet.add(d);
      });

      const sorted = Array.from(daySet).sort();
      res.json(sorted.map((date) => ({ date })));
    } catch (error) {
      console.error("Get member leave calendar error:", error);
      res.status(500).json({ message: "Failed to fetch leave calendar" });
    }
  }
);

/**
 * PUT /api/leave/member/:memberId/calendar-day
 * Admin: manually add/remove a leave day in calendar.
 * Body: { date: "YYYY-MM-DD", inactive: true|false }
 */
router.put(
  "/member/:memberId/calendar-day",
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { memberId } = req.params;
      const dateKey = String(req.body?.date || "").trim();
      const inactive = Boolean(req.body?.inactive);
      const fast = String(req.query?.fast || "").trim() === "1";

      if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) {
        return res.status(400).json({ message: "Invalid memberId" });
      }
      const day = parseYMDLocal(dateKey);
      if (!day) {
        return res.status(400).json({ message: "Invalid date. Use YYYY-MM-DD" });
      }
      const dayUtc = parseYMDUtc(dateKey);
      if (!dayUtc) {
        return res.status(400).json({ message: "Invalid date. Use YYYY-MM-DD" });
      }

      const member = await Member.findById(memberId).select("_id userId mealPlan").lean();
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      const monthStart = new Date(day.getFullYear(), day.getMonth(), 1);
      const monthStartUtc = new Date(
        Date.UTC(dayUtc.getUTCFullYear(), dayUtc.getUTCMonth(), 1, 0, 0, 0, 0)
      );
      const monthEndUtc = new Date(monthStartUtc);
      monthEndUtc.setUTCMonth(monthEndUtc.getUTCMonth() + 1);
      const stat = await LeaveStat.findOneAndUpdate(
        { memberId, month: monthStart },
        {
          $setOnInsert: {
            memberId,
            month: monthStart,
            inactiveDays: 0,
            chargeableLeaveDayKeys: [],
            shortLeaveDayKeys: [],
          },
        },
        { upsert: true, new: true }
      );

      const current = new Set([
        ...(Array.isArray(stat.chargeableLeaveDayKeys) ? stat.chargeableLeaveDayKeys : []),
        ...(Array.isArray(stat.shortLeaveDayKeys) ? stat.shortLeaveDayKeys : []),
      ]);
      if (inactive) current.add(dateKey);
      else current.delete(dateKey);

      const allSelectedKeys = Array.from(current).sort();
      const minStreakDays = await getMinLeaveStreakDays();
      const split = splitLeaveKeysByStreak(allSelectedKeys, minStreakDays);
      const streakMeta = computeLatestStreakMeta(allSelectedKeys);
      const leaveStreaks = buildLeaveStreaks(allSelectedKeys);
      stat.chargeableLeaveDayKeys = split.chargeable;
      stat.shortLeaveDayKeys = split.short;
      stat.inactiveDays = split.chargeable.length;
      stat.currentStreak = Number(streakMeta.currentStreak || 0);
      stat.lastLeaveDate = streakMeta.lastLeaveDate;
      await stat.save();

      // Fast path: update UI instantly, do heavy recalculation async.
      if (fast) {
        const todayKeyLocalFast = formatYMDLocal(new Date());
        const todayKeyUtcFast = formatYMDUtc(new Date());
        const isCurrentMonthFast =
          monthStart.getFullYear() === new Date().getFullYear() &&
          monthStart.getMonth() === new Date().getMonth();
        const isEditedDayTodayFast =
          dateKey === todayKeyLocalFast || dateKey === todayKeyUtcFast;
        const isTodayMarkedInactiveFast = isEditedDayTodayFast
          ? inactive
          : current.has(todayKeyLocalFast) || current.has(todayKeyUtcFast);
        const updatedMemberStatusFast =
          isCurrentMonthFast && isTodayMarkedInactiveFast ? "Inactive" : "Active";
        const updatedMemberStatusMrFast = statusMrFor(updatedMemberStatusFast);

        setImmediate(async () => {
          try {
            // Heavy sync (leave requests + member status + billing + monthly due cache)
            const monthStartFast = monthStart;
            const monthStartUtcFast = monthStartUtc;
            const monthEndUtcFast = monthEndUtc;

            const todayKeyLocal = todayKeyLocalFast;
            const isCurrentMonth =
              monthStartFast.getFullYear() === new Date().getFullYear() &&
              monthStartFast.getMonth() === new Date().getMonth();
            const leaveStreaks = buildLeaveStreaks(allSelectedKeys);
            const syncedStreaks =
              isCurrentMonth && Number(streakMeta.currentStreak || 0) > 0
                ? leaveStreaks.filter((s) => s.endKey !== todayKeyLocal)
                : leaveStreaks;
            const latestSyncedStreak =
              syncedStreaks.length > 0 ? syncedStreaks[syncedStreaks.length - 1] : null;
            const latestSyncedEndUtc = latestSyncedStreak
              ? parseYMDUtc(latestSyncedStreak.endKey)
              : null;

            await LeaveRequest.deleteMany({
              memberId: member._id,
              source: "CalendarEdit",
              $or: [
                { type: "Leave", startDate: { $gte: monthStartUtcFast, $lt: monthEndUtcFast } },
                { type: "Activation", endDate: { $gte: monthStartUtcFast, $lt: monthEndUtcFast } },
              ],
            });
            if (syncedStreaks.length > 0) {
              const docs = syncedStreaks
                .map((streak) => {
                  const startUtc = parseYMDUtc(streak.startKey);
                  const endUtc = parseYMDUtc(streak.endKey);
                  if (!startUtc || !endUtc) return null;
                  return [
                    {
                      memberId: member._id,
                      type: "Leave",
                      source: "CalendarEdit",
                      startDate: startUtc,
                      status: "Approved",
                      billingApplied: true,
                      billingDaysTotal: Number(streak.days || 0),
                      billingDaysByMonth: [
                        { month: monthStartUtcFast, days: Number(streak.days || 0) },
                      ],
                    },
                    {
                      memberId: member._id,
                      type: "Activation",
                      source: "CalendarEdit",
                      endDate: endUtc,
                      status: "Approved",
                      billingApplied: true,
                      billingDaysTotal: Number(streak.days || 0),
                      billingDaysByMonth: [
                        { month: monthStartUtcFast, days: Number(streak.days || 0) },
                      ],
                    },
                  ];
                })
                .filter(Boolean)
                .flat();
              if (docs.length > 0) {
                await LeaveRequest.insertMany(docs, { ordered: true });
              }
            }

            if (isCurrentMonth && latestSyncedEndUtc) {
              await LeaveRequest.findOneAndUpdate(
                {
                  memberId: member._id,
                  type: "Leave",
                  source: "Request",
                  status: "Approved",
                  isOngoing: true,
                },
                {
                  $set: {
                    endDate: latestSyncedEndUtc,
                    isOngoing: false,
                  },
                },
                { sort: { updatedAt: -1, createdAt: -1 }, new: false }
              );
            }

            const todayKeyUtc = todayKeyUtcFast;
            const isEditedDayToday = isEditedDayTodayFast;
            const isTodayMarkedInactive = isTodayMarkedInactiveFast;

            if (isCurrentMonth && isTodayMarkedInactive) {
              const ongoingStreak =
                leaveStreaks.find((s) => s.endKey === todayKeyLocal) || null;
              const ongoingStartUtc = ongoingStreak?.startKey
                ? parseYMDUtc(ongoingStreak.startKey)
                : null;
              if (ongoingStartUtc) {
                await LeaveRequest.findOneAndUpdate(
                  {
                    memberId: member._id,
                    type: "Leave",
                    source: "Request",
                    status: "Approved",
                    isOngoing: true,
                  },
                  {
                    $setOnInsert: {
                      memberId: member._id,
                      type: "Leave",
                      source: "Request",
                      status: "Approved",
                    },
                    $set: {
                      startDate: ongoingStartUtc,
                      endDate: null,
                      isOngoing: true,
                    },
                  },
                  { upsert: true, new: true, setDefaultsOnInsert: true }
                );
              }
            }

            const updatedMemberStatus = updatedMemberStatusFast;
            const updatedMemberStatusMr = statusMrFor(updatedMemberStatus);
            await Member.findByIdAndUpdate(
              member._id,
              { $set: { status: updatedMemberStatus, statusMr: updatedMemberStatusMr } },
              { new: false, runValidators: true }
            );

            const monthlyBilling = await calculateMemberBilling(memberId, monthStartFast, {
              approvedLeaveDayKeys: split.chargeable,
            });
            const nextDue = Math.max(0, Number(monthlyBilling?.remainingAmount || 0));
            const nextCollected = Math.max(0, Number(monthlyBilling?.paidAmount || 0));
            const nextStatus = nextDue > 0 ? "Pending" : "Paid";

            await MemberMonthlyDue.updateOne(
              { memberId, month: monthStartFast },
              {
                $set: {
                  ...(member.userId ? { userId: member.userId } : {}),
                  due: nextDue,
                  collected: nextCollected,
                  status: nextStatus,
                },
                $setOnInsert: {
                  memberId,
                  month: monthStartFast,
                },
              },
              { upsert: true }
            );
          } catch (err) {
            console.error("Calendar-day async sync failed:", err);
          }
        });

        return res.json({
          memberId,
          month: monthStart,
          chargeableLeaveDayKeys: split.chargeable,
          shortLeaveDayKeys: split.short,
          inactiveDays: stat.inactiveDays,
          memberStatus: updatedMemberStatusFast,
          memberStatusMr: updatedMemberStatusMrFast,
          minLeaveStreakDays: minStreakDays,
          fast: true,
        });
      }

      // Sync one LeaveRequest per completed streak for this month from calendar edits.
      // If the latest streak is still running today, keep it only in LeaveStat for now.
      const todayKeyLocal = formatYMDLocal(new Date());
      const isCurrentMonth =
        monthStart.getFullYear() === new Date().getFullYear() &&
        monthStart.getMonth() === new Date().getMonth();
      const syncedStreaks =
        isCurrentMonth && Number(streakMeta.currentStreak || 0) > 0
          ? leaveStreaks.filter((s) => s.endKey !== todayKeyLocal)
          : leaveStreaks;
      const latestSyncedStreak =
        syncedStreaks.length > 0 ? syncedStreaks[syncedStreaks.length - 1] : null;
      const latestSyncedEndUtc = latestSyncedStreak ? parseYMDUtc(latestSyncedStreak.endKey) : null;

      await LeaveRequest.deleteMany({
        memberId: member._id,
        source: "CalendarEdit",
        $or: [
          { type: "Leave", startDate: { $gte: monthStartUtc, $lt: monthEndUtc } },
          { type: "Activation", endDate: { $gte: monthStartUtc, $lt: monthEndUtc } },
        ],
      });
      if (syncedStreaks.length > 0) {
        const docs = syncedStreaks
          .map((streak) => {
            const startUtc = parseYMDUtc(streak.startKey);
            const endUtc = parseYMDUtc(streak.endKey);
            if (!startUtc || !endUtc) return null;
            return [
              {
                memberId: member._id,
                type: "Leave",
                source: "CalendarEdit",
                startDate: startUtc,
                status: "Approved",
                billingApplied: true,
                billingDaysTotal: Number(streak.days || 0),
                billingDaysByMonth: [{ month: monthStartUtc, days: Number(streak.days || 0) }],
              },
              {
                memberId: member._id,
                type: "Activation",
                source: "CalendarEdit",
                endDate: endUtc,
                status: "Approved",
                billingApplied: true,
                billingDaysTotal: Number(streak.days || 0),
                billingDaysByMonth: [{ month: monthStartUtc, days: Number(streak.days || 0) }],
              },
            ];
          })
          .filter(Boolean)
          .flat();
        if (docs.length > 0) {
          await LeaveRequest.insertMany(docs, { ordered: true });
        }
      }
      if (isCurrentMonth && latestSyncedEndUtc) {
        // If a member-request leave was approved with temporary endDate=today while streak was running,
        // close it once a completed streak end is known.
        await LeaveRequest.findOneAndUpdate(
          {
            memberId: member._id,
            type: "Leave",
            source: "Request",
            status: "Approved",
            isOngoing: true,
          },
          {
            $set: {
              endDate: latestSyncedEndUtc,
              isOngoing: false,
            },
          },
          { sort: { updatedAt: -1, createdAt: -1 }, new: false }
        );
      }

      const todayKeyUtc = formatYMDUtc(new Date());
      const isEditedDayToday = dateKey === todayKeyLocal || dateKey === todayKeyUtc;
      const isTodayMarkedInactive = isEditedDayToday
        ? inactive
        : current.has(todayKeyLocal) || current.has(todayKeyUtc);
      if (isCurrentMonth && isTodayMarkedInactive) {
        // Keep an ongoing LeaveRequest in sync when today's day is inactive via calendar edit.
        const ongoingStreak =
          leaveStreaks.find((s) => s.endKey === todayKeyLocal) || null;
        const ongoingStartUtc = ongoingStreak?.startKey
          ? parseYMDUtc(ongoingStreak.startKey)
          : null;
        if (ongoingStartUtc) {
          await LeaveRequest.findOneAndUpdate(
            {
              memberId: member._id,
              type: "Leave",
              source: "Request",
              status: "Approved",
              isOngoing: true,
            },
            {
              $setOnInsert: {
                memberId: member._id,
                type: "Leave",
                source: "Request",
                status: "Approved",
              },
              $set: {
                startDate: ongoingStartUtc,
                endDate: null,
                isOngoing: true,
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
      }
      let updatedMemberStatus = "Active";
      let updatedMemberStatusMr = statusMrFor("Active");
      if (isTodayMarkedInactive) {
        updatedMemberStatus = "Inactive";
        updatedMemberStatusMr = statusMrFor("Inactive");
        await Member.findByIdAndUpdate(
          member._id,
          {
            $set: {
              status: updatedMemberStatus,
              statusMr: updatedMemberStatusMr,
            },
          },
          { new: false, runValidators: true }
        );
      } else {
        await Member.findByIdAndUpdate(
          member._id,
          {
            $set: {
              status: updatedMemberStatus,
              statusMr: updatedMemberStatusMr,
            },
          },
          { new: false, runValidators: true }
        );
      }

      const monthlyBilling = await calculateMemberBilling(memberId, monthStart, {
        approvedLeaveDayKeys: split.chargeable,
      });
      const nextDue = Math.max(0, Number(monthlyBilling?.remainingAmount || 0));
      const nextCollected = Math.max(0, Number(monthlyBilling?.paidAmount || 0));
      const nextStatus = nextDue > 0 ? "Pending" : "Paid";
      const monthlyDue = await MemberMonthlyDue.findOneAndUpdate(
        { memberId, month: monthStart },
        {
          $set: {
            // Do not override with null for legacy members with missing userId.
            ...(member.userId ? { userId: member.userId } : {}),
            due: nextDue,
            collected: nextCollected,
            status: nextStatus,
          },
          $setOnInsert: {
            memberId,
            month: monthStart,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      const totalDue = (await calculateMemberTotalRemainingDue(memberId)) ?? 0;

      return res.json({
        memberId,
        month: monthStart,
        chargeableLeaveDayKeys: split.chargeable,
        shortLeaveDayKeys: split.short,
        inactiveDays: stat.inactiveDays,
        memberStatus: updatedMemberStatus,
        memberStatusMr: updatedMemberStatusMr,
        due: Number(monthlyDue?.due ?? nextDue),
        dueStatus: monthlyDue?.status || nextStatus,
        totalDue,
        minLeaveStreakDays: minStreakDays,
      });
    } catch (error) {
      console.error("Update member calendar day error:", error);
      return res.status(500).json({ message: "Failed to update calendar day" });
    }
  }
);

/**
 * POST /api/leave/admin/request
 * Admin: manually create a Leave/Activation request for a member.
 * Body:
 * - { memberId, type: "Leave", startDate, endDate? }
 * - { memberId, type: "Activation", endDate }
 *
 * Creates a LeaveRequest with source="Request" and status="Pending".
 */
router.post(
  "/admin/request",
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const memberId = String(req.body?.memberId || req.body?.studentId || "").trim();
      const type = req.body?.type === "Activation" ? "Activation" : "Leave";
      const startDate = req.body?.startDate;
      const endDate = req.body?.endDate;

      if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) {
        return res.status(400).json({ message: "Valid memberId is required" });
      }

      const member = await Member.findById(memberId).select("_id").lean();
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      let start = null;
      let end = null;

      if (type === "Leave") {
        start = parseDate(startDate);
        if (!start) {
          return res
            .status(400)
            .json({ message: "Valid startDate is required for leave request" });
        }
        // Optional endDate allowed for Leave (ongoing leave can be endDate=null).
        end = endDate ? parseDate(endDate) : null;
        if (endDate && !end) {
          return res.status(400).json({ message: "Invalid endDate" });
        }
        if (end && end.getTime() < start.getTime()) {
          return res.status(400).json({ message: "endDate cannot be before startDate" });
        }
      } else {
        end = parseDate(endDate);
        if (!end) {
          return res
            .status(400)
            .json({ message: "Valid endDate is required for activation request" });
        }
      }

      const doc = await LeaveRequest.create({
        memberId: member._id,
        type,
        startDate: start,
        endDate: end,
        status: "Pending",
        source: "Request",
        isOngoing: type === "Leave" && !end,
      });

      await doc.populate(
        "memberId",
        "name nameMr rollNumber roomOwnerName roomOwnerNameMr phone status statusMr mealPlan mealPlanMr"
      );

      return res.status(201).json(doc);
    } catch (error) {
      console.error("Admin create leave request error:", error);
      return res.status(500).json({ message: "Failed to create leave request" });
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
      const { startDate, endDate, type } = req.body;
    const normalizedType = type === "Activation" ? "Activation" : "Leave";
    let start = null;
    let end = null;

    if (!memberId) {
      return res.status(400).json({ message: "memberId is required" });
    }

    if (normalizedType === "Leave") {
      start = parseDate(startDate);
      if (!start) {
        return res.status(400).json({ message: "Valid startDate is required for leave request" });
      }
    } else {
      end = parseDate(endDate);
      if (!end) {
        return res
          .status(400)
          .json({ message: "Valid endDate is required for activation request" });
      }
    }

    const member = await Member.findById(memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

      const leave = await LeaveRequest.create({
      memberId: member._id,
      startDate: start,
      endDate: end,
      type: normalizedType,
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

    const minStreakDays = await getMinLeaveStreakDays();
    // Only streaks >= minStreakDays should contribute to inactiveDays
    let deltaInactive = 0;
    if (streak === minStreakDays) {
      // First time we hit threshold: count entire streak at once.
      deltaInactive = minStreakDays;
    } else if (streak > minStreakDays) {
      // Day above threshold each adds one more inactive day.
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

    // Legacy compatibility: some old leave docs can still have `studentId`
    // instead of `memberId`. Resolve and attach member details for admin UI.
    const legacyStudentIds = Array.from(
      new Set(
        leaves
          .filter((l) => !l.memberId && l.studentId)
          .map((l) => String(l.studentId))
      )
    );

    const legacyMemberMap = new Map();
    if (legacyStudentIds.length > 0) {
      const legacyMembers = await Member.find({ _id: { $in: legacyStudentIds } })
        .select(
          "name nameMr rollNumber roomOwnerName roomOwnerNameMr phone status statusMr mealPlan mealPlanMr"
        )
        .lean();
      for (const member of legacyMembers) {
        legacyMemberMap.set(String(member._id), member);
      }
    }

    leaves = leaves.map((l) => {
      if (l.memberId) return l;
      const fallbackMember = l.studentId
        ? legacyMemberMap.get(String(l.studentId))
        : null;
      return fallbackMember ? { ...l, memberId: fallbackMember } : l;
    });

    const memberIds = Array.from(
      new Set(
        leaves
          .map((l) => {
            if (!l.memberId) return null;
            return l.memberId._id ? l.memberId._id : l.memberId;
          })
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
        stats.map((s) => [
          String(s.memberId),
          {
            inactiveDays: Number(s.inactiveDays || 0),
            currentStreak: Number(s.currentStreak || 0),
          },
        ])
      );

      leaves = leaves.map((l) => {
        const sid = l.memberId
          ? l.memberId._id
            ? l.memberId._id
            : l.memberId
          : null;
        const key = sid ? String(sid) : null;
        const stat = key ? statMap.get(key) : null;
        return {
          ...l,
          currentInactiveDays: stat ? stat.inactiveDays : 0,
          leaveStatCurrentStreak: stat ? stat.currentStreak : 0,
        };
      });
    }

    const activationMemberIds = Array.from(
      new Set(
        leaves
          .filter((l) => l.type === "Activation")
          .map((l) => {
            if (!l.memberId) return null;
            return l.memberId._id ? l.memberId._id : l.memberId;
          })
          .filter((id) => !!id)
          .map((id) => String(id))
      )
    );

    let latestLeaveStartByMember = new Map();
    if (activationMemberIds.length > 0) {
      const oidList = activationMemberIds.map(
        (id) => new mongoose.Types.ObjectId(id)
      );
      const latestRows = await LeaveRequest.aggregate([
        { $match: { memberId: { $in: oidList }, type: "Leave" } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$memberId",
            startDate: { $first: "$startDate" },
          },
        },
      ]);
      latestLeaveStartByMember = new Map(
        latestRows.map((row) => [String(row._id), row.startDate])
      );
    }

    leaves = leaves.map((l) => {
      if (l.type !== "Activation") return l;
      const sid = l.memberId
        ? l.memberId._id
          ? l.memberId._id
          : l.memberId
        : null;
      const key = sid ? String(sid) : null;
      const latestStart = key ? latestLeaveStartByMember.get(key) : null;
      return {
        ...l,
        latestLeaveStartDate: latestStart != null ? latestStart : null,
      };
    });

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
    const resolvedMemberId = resolveLeaveMemberId(leave);
    if (resolvedMemberId && !leave.memberId) {
      leave.memberId = resolvedMemberId;
    }

    // Activation request -> activate member (enable app)
    // and close/reset ongoing leave streak.
    if (leave.type === "Activation" && resolvedMemberId) {
      try {
        const member = await Member.findById(resolvedMemberId);
        if (member && member.status !== "Active") {
          member.status = "Active";
          member.statusMr = statusMrFor("Active");
          await member.save();
        }
        const activationEndDateOnly = toDateOnlyUtc(new Date(leave.endDate || new Date()));
        const closedEndDate = new Date(activationEndDateOnly);
        await LeaveRequest.updateMany(
          {
            memberId: resolvedMemberId,
            type: "Leave",
            source: "Request",
            status: "Approved",
            isOngoing: true,
          },
          {
            $set: {
              endDate: closedEndDate,
              isOngoing: false,
            },
          }
        );

        const activationMonthStart = getMonthStart(
          new Date(leave.endDate || new Date())
        );
        await LeaveStat.findOneAndUpdate(
          { memberId: resolvedMemberId, month: activationMonthStart },
          {
            $setOnInsert: {
              memberId: resolvedMemberId,
              month: activationMonthStart,
            },
            $set: {
              currentStreak: 0,
              lastLeaveDate: null,
            },
          },
          { upsert: true, new: false }
        );
      } catch (memberError) {
        console.error("Failed to update member status on activation approve:", memberError);
      }
    }

    // Leave request -> mark member inactive (disable app)
    if (leave.type === "Leave" && resolvedMemberId) {
      try {
        const member = await Member.findById(resolvedMemberId);
        if (member && member.status !== "Inactive") {
          member.status = "Inactive";
          member.statusMr = statusMrFor("Inactive");
          await member.save();
        }

        // Billing rule: only completed Leave requests with duration >= 5 days
        // contribute to inactiveDays. Ongoing leave (no endDate yet) keeps streak open.
        if (member && leave.endDate && !leave.billingApplied) {
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

            if (totalDays >= (await getMinLeaveStreakDays())) {
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
        if (leave.source === "Request") {
          const todayDateOnly = toDateOnlyLocal(new Date());
          const leaveStartDateOnly = toDateOnlyLocal(new Date(leave.startDate));
          leave.isOngoing = !leave.endDate || leaveStartDateOnly.getTime() <= todayDateOnly.getTime();
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

    const resolvedMemberId = resolveLeaveMemberId(leave);
    if (resolvedMemberId && !leave.memberId) {
      leave.memberId = resolvedMemberId;
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

