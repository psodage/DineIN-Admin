const express = require("express");
// Legacy route kept for older admin builds.
// IMPORTANT: This now writes into SnackOrder so we have a single schema/collection.
const SnackOrder = require("../models/SnackOrder");
const {
  decrementSnackProductStock,
  incrementSnackProductStock,
} = require("../utils/snackStock");
const SnackProduct = require("../models/SnackProduct");
const { resolveEnglishMarathiPair } = require("../utils/translateEnToMr");
const {
  authenticate,
  requireMember,
  ensureSelfParam,
} = require("../middleware/authMiddleware");

const router = express.Router();

// GET /api/snacks - Fetch all snack orders
router.get("/", async (req, res) => {
  try {
    const orders = await SnackOrder.find()
      .sort({ date: -1, createdAt: -1 })
      .populate("snackId", "name nameMr price category")
      .populate("memberId", "name nameMr rollNumber roomOwnerName roomOwnerNameMr");

    const serialized = (orders || []).map((o) => {
      const pricePerItem = Number(o?.snackId?.price || 0);
      const totalPrice = pricePerItem * Number(o?.quantity || 0);
      const snackItem = o?.snackId?.name || "";
      const snackItemMr = o?.snackId?.nameMr || snackItem;
      return {
        ...o.toObject(),
        snackItem,
        snackItemMr,
        pricePerItem,
        totalPrice,
        memberName: !o.isOutsideCustomer ? o?.memberId?.name : undefined,
        memberNameMr: !o.isOutsideCustomer ? o?.memberId?.nameMr : undefined,
        customerName: o.isOutsideCustomer ? o?.customerName : undefined,
        customerNameMr: o.isOutsideCustomer ? o?.customerNameMr : undefined,
      };
    });

    res.json(serialized);
  } catch (error) {
    console.error("Get snacks error:", error);
    res.status(500).json({ message: "Failed to fetch snack orders" });
  }
});

// GET /api/snacks/orders/:memberId - member-only snack order list
router.get(
  "/orders/:memberId",
  authenticate,
  requireMember,
  ensureSelfParam("memberId"),
  async (req, res) => {
    try {
      const { memberId } = req.params;
      const orders = await SnackOrder.find({
        memberId: memberId,
        isOutsideCustomer: false,
      })
        .sort({ date: -1, createdAt: -1 })
        .populate("snackId", "name nameMr price category")
        .lean();

      const serialized = orders.map((o) => {
        const pricePerItem = Number(o?.snackId?.price || 0);
        const totalPrice = pricePerItem * Number(o?.quantity || 0);
        const snackItem = o?.snackId?.name || "";
        const snackItemMr = o?.snackId?.nameMr || snackItem;
        return {
          ...o,
          snackItem,
          snackItemMr,
          pricePerItem,
          totalPrice,
        };
      });

      res.json(serialized);
    } catch (error) {
      console.error("Get member snack orders error:", error);
      res.status(500).json({ message: "Failed to fetch snack orders" });
    }
  }
);

// POST /api/snacks - Create a new snack order
router.post("/", async (req, res) => {
  try {
    const {
      studentId,
      memberId,
      customerName,
      customerNameMr,
      studentName, // legacy
      snackId,
      snackProductId, // legacy/alternate
      snackItem, // legacy fallback (by name)
      quantity,
      date,
      isOutsideCustomer,
    } = req.body;

    if (!quantity) {
      return res.status(400).json({ message: "quantity is required" });
    }

    const outside = !!isOutsideCustomer;

    // If this is not an outside customer order, require a memberId as well.
    const resolvedMemberId = memberId || studentId;
    if (!outside && !resolvedMemberId) {
      return res.status(400).json({
        message: "Member ID is required for member snack orders",
      });
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ message: "Quantity must be an integer at least 1" });
    }

    const resolvedSnackId = snackId || snackProductId || undefined;
    let finalSnackId = resolvedSnackId;
    if (!finalSnackId && snackItem) {
      const product = await SnackProduct.findOne({ name: String(snackItem).trim() }).lean();
      finalSnackId = product?._id;
    }

    if (!finalSnackId) {
      return res.status(400).json({ message: "snackId is required" });
    }

    const snack = await SnackProduct.findById(finalSnackId).lean();
    if (!snack) {
      return res.status(404).json({ message: "Snack product not found" });
    }
    if (!snack.availability) {
      return res.status(400).json({ message: "Snack is not available" });
    }
    const availableStock = Number(snack.quantity);
    if (Number.isFinite(availableStock) && qty > availableStock) {
      return res.status(400).json({
        message: `Insufficient stock for ${snack.name}. Available: ${availableStock}`,
      });
    }

    const cn = String(customerName || "").trim();
    const sn = String(studentName || "").trim();
    const cmr = String(customerNameMr || "").trim();
    const namePrimary = outside ? cn || sn || cmr : "";

    if (outside && !namePrimary) {
      return res.status(400).json({ message: "Customer name is required" });
    }

    let resolvedCustomerName;
    let resolvedCustomerNameMr;
    if (outside) {
      const pair = await resolveEnglishMarathiPair(namePrimary, cmr || undefined);
      resolvedCustomerName = pair.en;
      resolvedCustomerNameMr = pair.mr;
    }

    const order = await SnackOrder.create({
      memberId: outside ? undefined : resolvedMemberId,
      customerName: resolvedCustomerName,
      customerNameMr: resolvedCustomerNameMr,
      snackId: finalSnackId,
      quantity: qty,
      chargedAmount: Number(qty) * Number(snack?.price || 0),
      date: date ? new Date(date) : new Date(),
      isOutsideCustomer: outside,
    });

    const stockResult = await decrementSnackProductStock(
      SnackProduct,
      finalSnackId,
      qty
    );
    if (!stockResult.ok && !stockResult.skipped) {
      await SnackOrder.findByIdAndDelete(order._id);
      return res.status(500).json({ message: "Could not update snack stock" });
    }

    const populated = await SnackOrder.findById(order._id)
      .populate("snackId", "name nameMr price category")
      .populate("memberId", "name nameMr rollNumber roomOwnerName roomOwnerNameMr")
      .lean();

    const pricePerItem = Number(populated?.snackId?.price || 0);
    const totalPrice = pricePerItem * Number(populated?.quantity || 0);

    res.status(201).json({
      ...populated,
      snackItem: populated?.snackId?.name || "",
      snackItemMr: populated?.snackId?.nameMr || populated?.snackId?.name || "",
      pricePerItem,
      totalPrice,
      memberName: !outside ? populated?.memberId?.name : undefined,
      memberNameMr: !outside ? populated?.memberId?.nameMr : undefined,
      customerName: outside ? populated?.customerName : undefined,
      customerNameMr: outside ? populated?.customerNameMr : undefined,
      referenceId: populated?.purchaseReference || String(populated?._id || ""),
    });
  } catch (error) {
    console.error("Create snack error:", error);
    res.status(500).json({ message: "Failed to create snack order" });
  }
});

// PUT /api/snacks/:id - Update a snack order
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      studentId,
      memberId,
      customerName,
      customerNameMr,
      studentName, // legacy
      snackId,
      snackProductId,
      snackItem, // legacy fallback (by name)
      quantity,
      date,
      isOutsideCustomer,
    } = req.body;

    const order = await SnackOrder.findById(id);
    if (!order) return res.status(404).json({ message: "Snack order not found" });
    const previousSnackId = order.snackId ? String(order.snackId) : "";
    const previousQty = Number(order.quantity) || 0;

    const outside = typeof isOutsideCustomer === "boolean" ? isOutsideCustomer : order.isOutsideCustomer;

    // Resolve snack reference
    let resolvedSnackId = snackId || snackProductId || order.snackId;
    if (!resolvedSnackId && snackItem) {
      const product = await SnackProduct.findOne({ name: String(snackItem).trim() }).lean();
      resolvedSnackId = product?._id;
    }

    if (resolvedSnackId) order.snackId = resolvedSnackId;
    order.isOutsideCustomer = outside;

    if (outside) {
      order.memberId = undefined;
      const hasCustomerNameInput =
        typeof customerName !== "undefined" ||
        typeof studentName !== "undefined" ||
        typeof customerNameMr !== "undefined";
      if (hasCustomerNameInput) {
        const cn = String(customerName || "").trim();
        const sn = String(studentName || "").trim();
        const cmr = String(customerNameMr || "").trim();
        const namePrimary = cn || sn || cmr;
        if (!namePrimary) {
          return res.status(400).json({ message: "Customer name is required" });
        }
        const pair = await resolveEnglishMarathiPair(namePrimary, cmr || undefined);
        order.customerName = pair.en;
        order.customerNameMr = pair.mr;
      }
    } else {
      const resolvedMemberId = memberId ?? studentId;
      if (resolvedMemberId !== undefined) order.memberId = resolvedMemberId;
      order.customerName = undefined;
      order.customerNameMr = undefined;
    }

    let hasBillingImpactChange = false;
    if (quantity !== undefined) {
      const q = Number(quantity);
      if (!Number.isFinite(q) || !Number.isInteger(q) || q < 1) {
        return res.status(400).json({
          message: "Quantity must be an integer at least 1",
        });
      }
      order.quantity = q;
      hasBillingImpactChange = true;
    }
    if (date) {
      order.date = new Date(date);
      hasBillingImpactChange = true;
    }
    if (snackId !== undefined || snackProductId !== undefined || snackItem !== undefined) {
      hasBillingImpactChange = true;
    }

    // Validate snack stock against delta/new assignment.
    const snackForStock = order.snackId
      ? await SnackProduct.findById(order.snackId).lean()
      : null;
    if (snackForStock) {
      const newSnackId = String(order.snackId);
      const newQty = Number(order.quantity) || 0;
      const isSameSnack = previousSnackId && previousSnackId === newSnackId;
      const qtyDelta = isSameSnack ? newQty - previousQty : newQty;
      if (!snackForStock.availability && qtyDelta > 0) {
        return res.status(400).json({ message: "Snack is not available" });
      }
      const availableStock = Number(snackForStock.quantity);
      if (
        Number.isFinite(availableStock) &&
        qtyDelta > 0 &&
        qtyDelta > availableStock
      ) {
        return res.status(400).json({
          message: `Insufficient stock for ${snackForStock.name}. Available: ${availableStock}`,
        });
      }
    }

    const newSnackId = order.snackId ? String(order.snackId) : "";
    const newQty = Number(order.quantity) || 0;
    const isSnackChanged = previousSnackId !== newSnackId;
    const stockOps = [];

    if (isSnackChanged) {
      const dec = await decrementSnackProductStock(SnackProduct, newSnackId, newQty);
      if (!dec.ok && !dec.skipped) {
        return res.status(400).json({ message: "Insufficient stock for selected snack" });
      }
      if (!dec.skipped) stockOps.push({ type: "decrement", snackId: newSnackId, qty: newQty });

      await incrementSnackProductStock(SnackProduct, previousSnackId, previousQty);
      stockOps.push({ type: "increment", snackId: previousSnackId, qty: previousQty });
    } else {
      const qtyDelta = newQty - previousQty;
      if (qtyDelta > 0) {
        const dec = await decrementSnackProductStock(SnackProduct, newSnackId, qtyDelta);
        if (!dec.ok && !dec.skipped) {
          return res.status(400).json({ message: "Insufficient stock for selected snack" });
        }
        if (!dec.skipped) stockOps.push({ type: "decrement", snackId: newSnackId, qty: qtyDelta });
      } else if (qtyDelta < 0) {
        const restoreQty = Math.abs(qtyDelta);
        await incrementSnackProductStock(SnackProduct, newSnackId, restoreQty);
        stockOps.push({ type: "increment", snackId: newSnackId, qty: restoreQty });
      }
    }

    if (hasBillingImpactChange) {
      // For normal orders, persist billed value as qty * current snack price.
      if (!order.billSplitRequestId) {
        const snackPrice = Number(snackForStock?.price || 0);
        order.chargedAmount = Number(order.quantity || 0) * snackPrice;
      }
    }

    try {
      await order.save();
    } catch (saveErr) {
      // Best-effort rollback if DB save fails after stock updates.
      for (let i = stockOps.length - 1; i >= 0; i -= 1) {
        const op = stockOps[i];
        if (op.type === "decrement") {
          await incrementSnackProductStock(SnackProduct, op.snackId, op.qty);
        } else {
          await decrementSnackProductStock(SnackProduct, op.snackId, op.qty);
        }
      }
      throw saveErr;
    }

    const populated = await SnackOrder.findById(order._id)
      .populate("snackId", "name nameMr price category")
      .populate("memberId", "name nameMr rollNumber roomOwnerName roomOwnerNameMr")
      .lean();

    const pricePerItem = Number(populated?.snackId?.price || 0);
    const totalPrice = pricePerItem * Number(populated?.quantity || 0);

    res.json({
      ...populated,
      snackItem: populated?.snackId?.name || "",
      snackItemMr: populated?.snackId?.nameMr || populated?.snackId?.name || "",
      pricePerItem,
      totalPrice,
      memberName: !outside ? populated?.memberId?.name : undefined,
      memberNameMr: !outside ? populated?.memberId?.nameMr : undefined,
      customerName: outside ? populated?.customerName : undefined,
      customerNameMr: outside ? populated?.customerNameMr : undefined,
    });
  } catch (error) {
    console.error("Update snack error:", error);
    res.status(500).json({ message: "Failed to update snack order" });
  }
});

// DELETE /api/snacks/:id - Delete a snack order
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const order = await SnackOrder.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Snack order not found" });
    }

    await SnackOrder.deleteOne({ _id: order._id });
    await incrementSnackProductStock(
      SnackProduct,
      order.snackId,
      Number(order.quantity) || 0
    );

    res.json({ message: "Snack order deleted successfully" });
  } catch (error) {
    console.error("Delete snack error:", error);
    res.status(500).json({ message: "Failed to delete snack order" });
  }
});

module.exports = router;
