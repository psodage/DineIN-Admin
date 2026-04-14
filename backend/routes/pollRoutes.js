const express = require("express");
const Poll = require("../models/Poll");
const { resolveEnglishMarathiPair } = require("../utils/translateEnToMr");
const { authenticate, requireAdmin, requireMember } = require("../middleware/authMiddleware");

const POLL_ADMIN_LIST_LIMIT = 120;

const router = express.Router();

function toUtcDayRange(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  const startOfDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
  return { startOfDay, endOfDay };
}

function normalizeOptions(options) {
  const list = Array.isArray(options) ? options : [];
  const out = [];
  for (const opt of list) {
    const key = String(opt?.key || "").trim().toLowerCase();
    const labelEn = String(opt?.label || "").trim();
    const labelMr = String(opt?.labelMr ?? opt?.label_mr ?? "").trim();
    if (!key || (!labelEn && !labelMr)) continue;
    if (out.some((o) => o.key === key)) continue;
    out.push({ key, labelEn, labelMr });
  }
  return out;
}

async function buildOptionsForDb(normalizedOptions) {
  const out = [];
  for (const o of normalizedOptions) {
    const en = String(o.labelEn || "").trim();
    const mr = String(o.labelMr || "").trim();
    const primary = en || mr;
    const pair = await resolveEnglishMarathiPair(primary, en ? mr : undefined);
    out.push({
      key: o.key,
      label: String(pair.en || "").trim() || o.key,
      labelMr: String(pair.mr || "").trim() || String(pair.en || "").trim() || o.key,
    });
  }
  return out;
}

function summarizePoll(poll, viewerMemberId) {
  const rawOptions = Array.isArray(poll?.options) ? poll.options : [];
  const options = rawOptions.map((o) => ({
    key: o.key,
    label: String(o.label || "").trim() || o.key,
    labelMr: o.labelMr || o.label,
  }));
  const votes = Array.isArray(poll?.votes) ? poll.votes : [];
  const counts = {};
  for (const o of options) counts[o.key] = 0;
  for (const v of votes) {
    if (v?.optionKey && Object.prototype.hasOwnProperty.call(counts, v.optionKey)) {
      counts[v.optionKey] += 1;
    }
  }
  const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0);
  const myVote = viewerMemberId
    ? votes.find((v) => String(v.memberId) === String(viewerMemberId))?.optionKey || null
    : null;

  return {
    _id: poll._id,
    date: poll.date,
    question: poll.question,
    questionMr: poll.questionMr || poll.question,
    options,
    counts,
    totalVotes,
    myVote,
    expiresAt: poll.expiresAt,
    createdAt: poll.createdAt,
    updatedAt: poll.updatedAt,
  };
}

// GET /api/polls/list — all recent polls (admin only), newest first
router.get("/list", authenticate, requireAdmin, async (req, res) => {
  try {
    const polls = await Poll.find()
      .sort({ date: -1 })
      .limit(POLL_ADMIN_LIST_LIMIT)
      .lean();
    return res.json(polls.map((p) => summarizePoll(p, null)));
  } catch (error) {
    console.error("List polls error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/polls?date=YYYY-MM-DD (or ISO)
// Accessible to both member and admin (any authenticated user).
router.get("/", authenticate, async (req, res) => {
  try {
    const dateQuery = req.query?.date;
    const range = toUtcDayRange(dateQuery || new Date());
    if (!range) return res.status(400).json({ message: "Invalid date" });

    const poll = await Poll.findOne({
      date: { $gte: range.startOfDay, $lt: range.endOfDay },
    }).lean();

    if (!poll) return res.json(null);

    const viewerMemberId = req.auth?.role === "member" ? req.auth.id : null;
    return res.json(summarizePoll(poll, viewerMemberId));
  } catch (error) {
    console.error("Get poll error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/polls - create poll for a date (admin only)
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const { date, question, options } = req.body || {};
    if (!date) return res.status(400).json({ message: "Date is required" });

    const range = toUtcDayRange(date);
    if (!range) return res.status(400).json({ message: "Invalid date" });

    const normalizedOptions = normalizeOptions(options);
    if (normalizedOptions.length < 2) {
      return res.status(400).json({ message: "At least 2 options are required" });
    }

    const existing = await Poll.findOne({
      date: { $gte: range.startOfDay, $lt: range.endOfDay },
    });
    if (existing) {
      return res.status(400).json({ message: "Poll already exists for this date" });
    }

    const qRaw = String(question || "Meal Preference").trim() || "Meal Preference";
    const qPair = await resolveEnglishMarathiPair(qRaw, req.body?.questionMr);
    const optionsStored = await buildOptionsForDb(normalizedOptions);

    const poll = await Poll.create({
      date: range.startOfDay,
      question: qPair.en,
      questionMr: qPair.mr,
      options: optionsStored,
      votes: [],
      expiresAt: range.endOfDay,
    });

    return res.status(201).json(summarizePoll(poll.toObject(), null));
  } catch (error) {
    console.error("Create poll error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/polls/:id - update poll question/options (admin only)
router.put("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { question, options } = req.body || {};

    const poll = await Poll.findById(id);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    if (typeof question !== "undefined") {
      const qRaw = String(question || "").trim() || "Meal Preference";
      const qPair = await resolveEnglishMarathiPair(qRaw, req.body?.questionMr);
      poll.question = qPair.en;
      poll.questionMr = qPair.mr;
    }

    if (typeof options !== "undefined") {
      const normalizedOptions = normalizeOptions(options);
      if (normalizedOptions.length < 2) {
        return res.status(400).json({ message: "At least 2 options are required" });
      }

      const keys = new Set(normalizedOptions.map((o) => o.key));
      poll.votes = (poll.votes || []).filter((v) => keys.has(String(v.optionKey)));
      poll.options = await buildOptionsForDb(normalizedOptions);
    }

    await poll.save();
    return res.json(summarizePoll(poll.toObject(), null));
  } catch (error) {
    console.error("Update poll error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/polls/:id (admin only)
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const deleted = await Poll.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Poll not found" });
    return res.json({ message: "Poll deleted successfully" });
  } catch (error) {
    console.error("Delete poll error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/polls/:id/vote (member only)
router.post("/:id/vote", authenticate, requireMember, async (req, res) => {
  try {
    const { id } = req.params;
    const { optionKey } = req.body || {};

    const poll = await Poll.findById(id);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    if (poll.expiresAt && new Date(poll.expiresAt).getTime() <= Date.now()) {
      return res.status(400).json({ message: "Poll has expired" });
    }

    const key = String(optionKey || "").trim().toLowerCase();
    const valid = (poll.options || []).some((o) => o.key === key);
    if (!valid) return res.status(400).json({ message: "Invalid option" });

    const memberId = req.member?._id;
    const already = (poll.votes || []).some((v) => String(v.memberId) === String(memberId));
    if (already) {
      return res.status(400).json({ message: "You have already voted" });
    }

    poll.votes.push({ memberId, optionKey: key });
    await poll.save();

    return res.json(summarizePoll(poll.toObject(), memberId));
  } catch (error) {
    console.error("Vote poll error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
