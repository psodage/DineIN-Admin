const express = require("express");
const Expense = require("../models/Expense");
const { translateToMarathiIfNeeded } = require("../utils/translateEnToMr");

const router = express.Router();

// GET /api/expenses - Fetch all expenses
router.get("/", async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ date: -1, createdAt: -1 });
    res.json(expenses);
  } catch (error) {
    console.error("Get expenses error:", error);
    res.status(500).json({ message: "Failed to fetch expenses" });
  }
});

// POST /api/expenses - Create a new expense
router.post("/", async (req, res) => {
  try {
    const {
      title,
      titleMr,
      category,
      amount,
      date,
      description,
      descriptionMr,
    } = req.body;

    if (!title || !category || amount === undefined || amount === null || !date) {
      return res.status(400).json({
        message: "Title, category, amount and date are required",
      });
    }

    const titleEn = String(title).trim();
    const descriptionEn = description ? String(description).trim() : "";

    const [resolvedTitleMr, resolvedDescriptionMr] = await Promise.all([
      translateToMarathiIfNeeded({ enText: titleEn, mrText: titleMr }),
      translateToMarathiIfNeeded({ enText: descriptionEn, mrText: descriptionMr }),
    ]);

    const expense = new Expense({
      title: titleEn,
      titleMr: resolvedTitleMr || "",
      category: String(category).trim(),
      amount: Number(amount),
      date: new Date(date),
      description: descriptionEn,
      descriptionMr: resolvedDescriptionMr || "",
    });

    await expense.save();
    res.status(201).json(expense);
  } catch (error) {
    console.error("Create expense error:", error);
    res.status(500).json({ message: "Failed to create expense" });
  }
});

// PUT /api/expenses/:id - Update an expense
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, titleMr, category, amount, date, description, descriptionMr } = req.body;

    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    const nextTitleEn = title !== undefined ? String(title).trim() : expense.title;
    const nextDescriptionEn =
      description !== undefined ? String(description || "").trim() : expense.description;

    if (title !== undefined) expense.title = nextTitleEn;
    if (titleMr !== undefined || title !== undefined) {
      expense.titleMr = await translateToMarathiIfNeeded({
        enText: nextTitleEn,
        mrText: titleMr !== undefined ? titleMr : nextTitleEn,
      });
    }
    if (category) expense.category = String(category).trim();
    if (amount !== undefined) expense.amount = Number(amount);
    if (date) expense.date = new Date(date);
    if (description !== undefined) expense.description = nextDescriptionEn;
    if (descriptionMr !== undefined || description !== undefined) {
      expense.descriptionMr = await translateToMarathiIfNeeded({
        enText: nextDescriptionEn,
        mrText: descriptionMr !== undefined ? descriptionMr : nextDescriptionEn,
      });
    }

    await expense.save();
    res.json(expense);
  } catch (error) {
    console.error("Update expense error:", error);
    res.status(500).json({ message: "Failed to update expense" });
  }
});

// DELETE /api/expenses/:id - Delete an expense
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findByIdAndDelete(id);
    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }
    res.json({ message: "Expense deleted successfully" });
  } catch (error) {
    console.error("Delete expense error:", error);
    res.status(500).json({ message: "Failed to delete expense" });
  }
});

module.exports = router;
