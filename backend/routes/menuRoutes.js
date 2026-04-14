const express = require("express");
const Menu = require("../models/Menu");
const { resolveEnglishMarathiPair } = require("../utils/translateEnToMr");

const router = express.Router();

const normalizeOptionKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const buildOptionPayload = (body) => {
  const pollOptionKey = normalizeOptionKey(body?.pollOptionKey);
  if (!pollOptionKey) {
    return {
      pollOptionKey: "",
      pollOptionLabel: "",
      pollOptionLabelMr: "",
    };
  }
  return {
    pollOptionKey,
    pollOptionLabel: String(body?.pollOptionLabel || "").trim(),
    pollOptionLabelMr: String(body?.pollOptionLabelMr || "").trim(),
  };
};

const buildOptionConflictQuery = (dayRange, optionKey) => {
  const dateQuery = {
    date: { $gte: dayRange.startOfDay, $lt: dayRange.endOfDay },
  };
  if (optionKey) {
    return { ...dateQuery, pollOptionKey: optionKey };
  }
  return {
    ...dateQuery,
    $or: [
      { pollOptionKey: { $exists: false } },
      { pollOptionKey: "" },
      { pollOptionKey: null },
    ],
  };
};

// GET /api/menu - Fetch all menus
router.get("/", async (req, res) => {
  try {
    const menus = await Menu.find().sort({ date: -1 });
    res.json(menus);
  } catch (error) {
    console.error("Get menus error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/menu - Create a new menu
router.post("/", async (req, res) => {
  try {
    const { date, lunch, dinner } = req.body;

    if (!date) {
      return res.status(400).json({
        message: "Date is required",
      });
    }

    const d = new Date(date);
    const startOfDay = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
    const optionPayload = buildOptionPayload(req.body);
    const existingMenu = await Menu.findOne(
      buildOptionConflictQuery(
        { startOfDay, endOfDay },
        optionPayload.pollOptionKey
      )
    );
    if (existingMenu) {
      return res.status(400).json({
        message: optionPayload.pollOptionKey
          ? "Menu already exists for this date and category"
          : "Menu already exists for this date",
      });
    }

    const lunchEn = String(lunch).trim();
    const dinnerEn = String(dinner).trim();
    if (!lunchEn && !dinnerEn) {
      return res.status(400).json({
        message: "Please provide lunch or dinner",
      });
    }
    const [lunchPair, dinnerPair] = await Promise.all([
      resolveEnglishMarathiPair(lunchEn, req.body?.lunchMr),
      resolveEnglishMarathiPair(dinnerEn, req.body?.dinnerMr),
    ]);

    const menu = new Menu({
      date: startOfDay,
      ...optionPayload,
      lunch: lunchPair.en,
      lunchMr: lunchPair.mr,
      dinner: dinnerPair.en,
      dinnerMr: dinnerPair.mr,
    });

    await menu.save();
    res.status(201).json(menu);
  } catch (error) {
    console.error("Create menu error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/menu/:id - Update a menu
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { date, lunch, dinner } = req.body;

    const lunchEn = String(lunch).trim();
    const dinnerEn = String(dinner).trim();
    if (!lunchEn && !dinnerEn) {
      return res.status(400).json({
        message: "Please provide lunch or dinner",
      });
    }

    const menu = await Menu.findById(id);
    if (!menu) {
      return res.status(404).json({ message: "Menu not found" });
    }

    const nextDate = date ? new Date(date) : new Date(menu.date);
    const startOfDay = new Date(
      Date.UTC(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate())
    );
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
    const optionPayload = buildOptionPayload(req.body);

    const conflict = await Menu.findOne({
      ...buildOptionConflictQuery(
        { startOfDay, endOfDay },
        optionPayload.pollOptionKey
      ),
      _id: { $ne: menu._id },
    }).lean();
    if (conflict) {
      return res.status(400).json({
        message: optionPayload.pollOptionKey
          ? "Menu already exists for this date and category"
          : "Menu already exists for this date",
      });
    }

    menu.date = startOfDay;
    menu.pollOptionKey = optionPayload.pollOptionKey;
    menu.pollOptionLabel = optionPayload.pollOptionLabel;
    menu.pollOptionLabelMr = optionPayload.pollOptionLabelMr;
    const [lunchPair, dinnerPair] = await Promise.all([
      resolveEnglishMarathiPair(lunchEn, req.body?.lunchMr),
      resolveEnglishMarathiPair(dinnerEn, req.body?.dinnerMr),
    ]);
    menu.lunch = lunchPair.en;
    menu.lunchMr = lunchPair.mr;
    menu.dinner = dinnerPair.en;
    menu.dinnerMr = dinnerPair.mr;

    await menu.save();
    res.json(menu);
  } catch (error) {
    console.error("Update menu error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/menu/:id - Delete a menu
router.delete("/:id", async (req, res) => {
  try {
    const menu = await Menu.findByIdAndDelete(req.params.id);
    if (!menu) {
      return res.status(404).json({ message: "Menu not found" });
    }
    res.json({ message: "Menu deleted successfully" });
  } catch (error) {
    console.error("Delete menu error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
