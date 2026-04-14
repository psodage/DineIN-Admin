const express = require("express");
const SnackProduct = require("../models/SnackProduct");
const { translateToMarathiIfNeeded } = require("../utils/translateEnToMr");

const router = express.Router();

// POST /api/snack-products/add - add snack product
router.post("/add", async (req, res) => {
  try {
    const { name, nameMr, price, category, availability, quantity } = req.body;

    if (!name || price == null) {
      return res
        .status(400)
        .json({ message: "Name and price are required" });
    }

    const normalizedPrice = Number(price);
    if (isNaN(normalizedPrice) || normalizedPrice < 0) {
      return res.status(400).json({ message: "Price must be a valid number" });
    }

    const normalizedQuantity =
      quantity === undefined || quantity === null || quantity === ""
        ? 0
        : Number(quantity);
    if (isNaN(normalizedQuantity) || normalizedQuantity < 0) {
      return res.status(400).json({ message: "Quantity must be a valid number" });
    }

    const nameEn = String(name).trim();
    const resolvedNameMr = await translateToMarathiIfNeeded({ enText: nameEn, mrText: nameMr });

    const product = await SnackProduct.create({
      name: nameEn,
      nameMr: resolvedNameMr || "",
      price: normalizedPrice,
      category:
        ["Beverage", "Food", "Other"].includes(category) && category
          ? category
          : "Other",
      availability: availability === false ? false : true,
      quantity: normalizedQuantity,
    });

    res.status(201).json(product);
  } catch (error) {
    console.error("Add snack product error:", error);
    res.status(500).json({ message: "Failed to add snack product" });
  }
});

// GET /api/snack-products - get all snacks
// Optional query ?available=true to only fetch available products
router.get("/", async (req, res) => {
  try {
    const { available } = req.query;
    const filter = {};
    if (available === "true") {
      filter.availability = true;
    }

    const snacks = await SnackProduct.find(filter).sort({ createdAt: -1 });
    res.json(snacks);
  } catch (error) {
    console.error("Get snack products error:", error);
    res.status(500).json({ message: "Failed to fetch snack products" });
  }
});

// PUT /api/snack-products/update/:id - update snack product
router.put("/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, nameMr, price, category, availability, quantity } = req.body;

    const product = await SnackProduct.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Snack product not found" });
    }

    const nextNameEn = name !== undefined ? String(name).trim() : product.name;
    if (name !== undefined) {
      product.name = nextNameEn || product.name;
    }

    // Keep MR in sync for admin edits:
    // - If name is changed, always translate EN->MR.
    // - If only nameMr is changed, translate only when it looks like copied EN.
    if (name !== undefined || nameMr !== undefined) {
      const mrInput = nameMr !== undefined ? nameMr : nextNameEn;
      product.nameMr = await translateToMarathiIfNeeded({
        enText: nextNameEn,
        mrText: mrInput,
      });
    }
    if (price !== undefined) {
      const normalizedPrice = Number(price);
      if (isNaN(normalizedPrice) || normalizedPrice < 0) {
        return res
          .status(400)
          .json({ message: "Price must be a valid number" });
      }
      product.price = normalizedPrice;
    }
    if (category !== undefined) {
      product.category =
        ["Beverage", "Food", "Other"].includes(category) && category
          ? category
          : product.category;
    }
    if (availability !== undefined) {
      product.availability = !!availability;
    }

    if (quantity !== undefined) {
      const normalizedQuantity = quantity === "" ? 0 : Number(quantity);
      if (isNaN(normalizedQuantity) || normalizedQuantity < 0) {
        return res.status(400).json({ message: "Quantity must be a valid number" });
      }
      product.quantity = normalizedQuantity;
    }

    await product.save();
    res.json(product);
  } catch (error) {
    console.error("Update snack product error:", error);
    res.status(500).json({ message: "Failed to update snack product" });
  }
});

// DELETE /api/snack-products/delete/:id - delete snack product
router.delete("/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const product = await SnackProduct.findByIdAndDelete(id);

    if (!product) {
      return res.status(404).json({ message: "Snack product not found" });
    }

    res.json({ message: "Snack product deleted" });
  } catch (error) {
    console.error("Delete snack product error:", error);
    res.status(500).json({ message: "Failed to delete snack product" });
  }
});

module.exports = router;

