const express = require("express");
const mongoose = require("mongoose");
const SnackOrder = require("../models/SnackOrder");
const SnackProduct = require("../models/SnackProduct");
const Member = require("../models/Member");
const {
  authenticate,
  requireMember,
  requireAdmin,
  ensureSelfBody,
  ensureSelfParam,
} = require("../middleware/authMiddleware");

const { applyPurchaseReferences } = require("../utils/snackOrderReference");
const {
  decrementSnackProductStock,
  decrementStockForOrderRows,
  restoreDecrementedStock,
} = require("../utils/snackStock");

const router = express.Router();

function resolveSnackOrderTotal(orderDoc) {
  const chargedRaw = orderDoc?.chargedAmount;
  const hasChargedAmount = chargedRaw !== null && chargedRaw !== undefined;
  if (hasChargedAmount) {
    const charged = Number(chargedRaw);
    if (Number.isFinite(charged) && charged >= 0) return charged;
  }
  const qty = Number(orderDoc?.quantity || 0);
  const price = Number(orderDoc?.snackId?.price || 0);
  return qty * price;
}

// POST /api/snack-orders/order - place snack order
router.post(
  "/order",
  authenticate,
  requireMember,
  ensureSelfBody("studentId"),
  async (req, res) => {
    try {
      const memberId = req.body?.memberId || req.body?.studentId;
      const { snackId, quantity, date } = req.body;

      if (!memberId || !snackId || !quantity) {
        return res.status(400).json({
          message: "memberId, snackId and quantity are required",
        });
      }

      const qty = Number(quantity);
      if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 1) {
        return res
          .status(400)
          .json({ message: "Quantity must be an integer at least 1" });
      }

      const snack = await SnackProduct.findById(snackId);
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

      const orderDate = date ? new Date(date) : new Date();

      const order = await SnackOrder.create({
        memberId,
        snackId,
        quantity: qty,
        chargedAmount: Number(qty) * Number(snack?.price || 0),
        date: orderDate,
        isOutsideCustomer: false,
        customerName: undefined,
      });

      const stockResult = await decrementSnackProductStock(SnackProduct, snackId, qty);
      if (!stockResult.ok && !stockResult.skipped) {
        await SnackOrder.findByIdAndDelete(order._id);
        return res.status(500).json({ message: "Could not update snack stock" });
      }

      // Populate for response display fields (totalPrice is computed, not stored).
      const populated = await SnackOrder.findById(order._id)
        .populate("snackId", "name price category")
        .populate("memberId", "name rollNumber roomOwnerName")
        .lean();

      const snackPrice = Number(populated?.snackId?.price || 0);
      const totalPrice = snackPrice * Number(populated?.quantity || 0);

      res.status(201).json({
        ...populated,
        snackItem: populated?.snackId?.name || "",
        pricePerItem: snackPrice,
        totalPrice,
        referenceId:
          populated?.purchaseReference || String(populated?._id || ""),
      });
    } catch (error) {
      console.error("Create snack order error:", error);
      res.status(500).json({ message: "Failed to place snack order" });
    }
  }
);

// POST /api/snack-orders/bulk-order - place multiple snack orders
router.post(
  "/bulk-order",
  authenticate,
  requireMember,
  ensureSelfBody("studentId"),
  async (req, res) => {
    try {
      const memberId = req.body?.memberId || req.body?.studentId;
      const { orders, date } = req.body;

      if (!memberId || !Array.isArray(orders) || orders.length === 0) {
        return res.status(400).json({
          message: "memberId and a non-empty orders array are required",
        });
      }

      const orderResults = [];
      const orderDate = date ? new Date(date) : new Date();

      for (const item of orders) {
        const { snackId, quantity } = item;
        const qty = Number(quantity);
        if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 1) {
          return res.status(400).json({
            message: "Invalid quantity in one of the items (integer min 1 required)",
          });
        }

        const snack = await SnackProduct.findById(snackId);
        if (!snack) {
          return res.status(404).json({ message: `Snack product not found` });
        }
        if (!snack.availability) {
          return res.status(400).json({ message: `Snack ${snack.name} is not available` });
        }

        const availableStock = Number(snack.quantity);
        if (Number.isFinite(availableStock) && qty > availableStock) {
          return res.status(400).json({
            message: `Insufficient stock for ${snack.name}. Available: ${availableStock}`,
          });
        }

        orderResults.push({
          memberId,
          snackId,
          quantity: qty,
          chargedAmount: Number(qty) * Number(snack?.price || 0),
          date: orderDate,
          isOutsideCustomer: false,
          customerName: undefined,
        });
      }

      const stockPrep = await decrementStockForOrderRows(SnackProduct, orderResults);
      if (!stockPrep.ok) {
        return res.status(500).json({ message: "Could not update snack stock" });
      }
      const { decremented } = stockPrep;

      let createdOrders;
      try {
        createdOrders = await SnackOrder.insertMany(orderResults);
      } catch (insertErr) {
        await restoreDecrementedStock(SnackProduct, decremented);
        throw insertErr;
      }

      await applyPurchaseReferences(SnackOrder, createdOrders);

      const snacks = await SnackOrder.find({
        _id: { $in: createdOrders.map((o) => o._id) },
      })
        .populate("snackId", "price")
        .lean();

      const totalAmount = snacks.reduce(
        (sum, o) => sum + Number(o.quantity || 0) * Number(o?.snackId?.price || 0),
        0
      );

      const ordersOut = snacks.map((o) => ({
        ...o,
        _id: String(o._id),
        referenceId: o.purchaseReference || String(o._id),
      }));

      res.status(201).json({ orders: ordersOut, totalAmount });
    } catch (error) {
      console.error("Create bulk snack order error:", error);
      res.status(500).json({ message: "Failed to place bulk snack order" });
    }
  }
);

// GET /api/snack-orders/orders/:memberId - get member snack orders
router.get(
  "/orders/:memberId",
  authenticate,
  requireMember,
  ensureSelfParam("memberId"),
  async (req, res) => {
    try {
      const { memberId } = req.params;
      const orders = await SnackOrder.find({ memberId })
        .sort({ date: -1, createdAt: -1 })
        .populate("snackId", "name price category")
        .lean();
      const normalized = orders.map((o) => ({
        ...o,
        totalPrice: resolveSnackOrderTotal(o),
        commonOrderId:
          String(o?.commonOrderId || "").trim() ||
          (o?.billSplitRequestId ? String(o.billSplitRequestId) : ""),
      }));
      res.json(normalized);
    } catch (error) {
      console.error("Get snack orders error:", error);
      res.status(500).json({ message: "Failed to fetch snack orders" });
    }
  }
);

// GET /api/snack-orders/validate/bulk - explicit bulk path guard (legacy clients)
router.get("/validate/bulk", (req, res) => {
  return res.status(400).json({
    message:
      "Bulk orders cannot be validated via this endpoint. Please validate individual orders.",
  });
});

// POST /api/snack-orders/validate/bulk - validate a bulk snack receipt QR
router.post("/validate/bulk", async (req, res) => {
  try {
    const { orderIds } = req.body || {};

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: "orderIds must be a non-empty array" });
    }

    const ids = orderIds.map((id) => String(id)).filter(Boolean);
    const invalid = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalid.length) {
      return res.status(400).json({ message: "Invalid orderId format in bulk QR" });
    }

    const orders = await SnackOrder.find({ _id: { $in: ids } })
      .populate("snackId", "name nameMr price category")
      .populate("memberId", "name nameMr rollNumber roomNumber roomOwnerName roomOwnerNameMr")
      .lean();

    if (!orders.length) {
      return res.status(404).json({ message: "Snack orders not found" });
    }

    const totalAmount = orders.reduce((sum, o) => sum + resolveSnackOrderTotal(o), 0);
    const totalQuantity = orders.reduce((sum, o) => sum + Number(o.quantity || 0), 0);

    const members = Array.from(
      new Map(
        orders
          .map((o) => o?.memberId)
          .filter(Boolean)
          .map((m) => [
            String(m._id),
            {
              _id: String(m._id),
              name: m.name || "",
              nameMr: m.nameMr || m.name || "",
            },
          ])
      ).values()
    );
    const member = members.length === 1 ? members[0] : undefined;

    res.json({ totalAmount, totalQuantity, member, members, count: orders.length });
  } catch (error) {
    console.error("Validate bulk snack order error:", error);
    res.status(500).json({ message: "Failed to validate bulk snack order" });
  }
});

// GET /api/snack-orders/validate/:orderId - validate a specific snack order by QR orderId
router.get("/validate/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ message: "orderId is required" });
    }

    if (orderId === "bulk") {
      return res.status(400).json({ message: "Bulk orders cannot be validated via QR scanner." });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid orderId format" });
    }

    const order = await SnackOrder.findById(orderId)
      .populate("snackId", "name nameMr price category")
      .populate("memberId", "name nameMr rollNumber roomNumber roomOwnerName roomOwnerNameMr")
      .lean();

    if (!order) {
      return res.status(404).json({ message: "Snack order not found" });
    }

    const snackPrice = Number(order?.snackId?.price || 0);
    const totalPrice = resolveSnackOrderTotal(order);

    res.json({
      ...order,
      snackItem: order?.snackId?.name || "",
      snackItemMr: order?.snackId?.nameMr || order?.snackId?.name || "",
      pricePerItem: snackPrice,
      totalPrice,
      memberName: order?.memberId?.name || undefined,
      memberNameMr: order?.memberId?.nameMr || order?.memberId?.name || undefined,
    });
  } catch (error) {
    console.error("Validate snack order error:", error);
    res.status(500).json({ message: "Failed to validate snack order" });
  }
});

// Admin CRUD endpoints (used by admin screens / legacy)

// GET /api/snack-orders - list all snack orders
router.get("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const orders = await SnackOrder.find()
      .sort({ date: -1, createdAt: -1 })
      .populate("snackId", "name price category")
      .populate("memberId", "name rollNumber roomOwnerName")
      .lean();

    const serialized = orders.map((o) => {
      const pricePerItem = Number(o?.snackId?.price || 0);
      const totalPrice = resolveSnackOrderTotal(o);
      const snackItem = o?.snackId?.name || "";

      return {
        ...o,
        snackItem,
        pricePerItem,
        totalPrice,
        memberName: !o.isOutsideCustomer ? o?.memberId?.name : undefined,
        customerName: o.isOutsideCustomer ? o?.customerName : undefined,
      };
    });

    res.json(serialized);
  } catch (error) {
    console.error("Get snack orders (admin) error:", error);
    res.status(500).json({ message: "Failed to fetch snack orders" });
  }
});

// POST /api/snack-orders - create snack order (member or outside) from admin module
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      memberId: bodyMemberId,
      customerName,
      snackId,
      quantity,
      date,
      isOutsideCustomer,
      snackItem,
      studentName,
    } = req.body;

    const resolvedMemberId = bodyMemberId || req.body?.studentId;
    const outside = !!isOutsideCustomer;
    if (!outside && !resolvedMemberId) {
      return res.status(400).json({
        message: "Member ID is required for member snack orders",
      });
    }

    // Resolve SnackProduct reference:
    // - preferred: snackId
    // - legacy: snackItem name
    let resolvedSnackId = snackId || undefined;
    if (!resolvedSnackId && snackItem) {
      const product = await SnackProduct.findOne({ name: String(snackItem).trim() }).lean();
      resolvedSnackId = product?._id;
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ message: "Quantity must be an integer at least 1" });
    }

    if (!resolvedSnackId) {
      return res.status(400).json({ message: "snackId is required" });
    }

    const productForStock = await SnackProduct.findById(resolvedSnackId);
    if (!productForStock) {
      return res.status(404).json({ message: "Snack product not found" });
    }
    if (!productForStock.availability) {
      return res.status(400).json({ message: "Snack is not available" });
    }
    const availableStock = Number(productForStock.quantity);
    if (Number.isFinite(availableStock) && qty > availableStock) {
      return res.status(400).json({
        message: `Insufficient stock for ${productForStock.name}. Available: ${availableStock}`,
      });
    }

    const resolvedCustomerName = outside
      ? String(customerName || studentName || "").trim()
      : undefined;

    const order = await SnackOrder.create({
      memberId: outside ? undefined : resolvedMemberId,
      customerName: resolvedCustomerName || undefined,
      snackId: resolvedSnackId,
      quantity: qty,
      chargedAmount: Number(qty) * Number(productForStock?.price || 0),
      date: date ? new Date(date) : new Date(),
      isOutsideCustomer: outside,
    });

    const stockResult = await decrementSnackProductStock(
      SnackProduct,
      resolvedSnackId,
      qty
    );
    if (!stockResult.ok && !stockResult.skipped) {
      await SnackOrder.findByIdAndDelete(order._id);
      return res.status(500).json({ message: "Could not update snack stock" });
    }

    const populated = await SnackOrder.findById(order._id)
      .populate("snackId", "name price category")
      .populate("memberId", "name rollNumber roomOwnerName")
      .lean();

    const pricePerItem = Number(populated?.snackId?.price || 0);
    const totalPrice = resolveSnackOrderTotal(populated);
    res.status(201).json({
      ...populated,
      snackItem: populated?.snackId?.name || "",
      pricePerItem,
      totalPrice,
      memberName: !outside ? populated?.memberId?.name : undefined,
      customerName: outside ? populated?.customerName : undefined,
      referenceId: populated?.purchaseReference || String(populated?._id || ""),
    });
  } catch (error) {
    console.error("Create snack order (admin) error:", error);
    res.status(500).json({ message: "Failed to create snack order" });
  }
});

// PUT /api/snack-orders/:id - update a snack order (admin)
router.put("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await SnackOrder.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Snack order not found" });
    }

    const {
      memberId: bodyMemberId,
      customerName,
      snackId,
      quantity,
      date,
      isOutsideCustomer,
      snackItem,
      studentName,
    } = req.body;

    if (typeof isOutsideCustomer === "boolean") {
      existing.isOutsideCustomer = isOutsideCustomer;
      if (isOutsideCustomer) existing.memberId = undefined;
    }
    const resolvedMemberId = bodyMemberId ?? req.body?.studentId;
    if (resolvedMemberId !== undefined) {
      existing.memberId = existing.isOutsideCustomer ? undefined : resolvedMemberId;
    }

    if (snackId !== undefined) existing.snackId = snackId || undefined;
    if (snackId === undefined && snackItem) {
      const product = await SnackProduct.findOne({ name: String(snackItem).trim() }).lean();
      existing.snackId = product?._id;
    }

    if (existing.isOutsideCustomer) {
      const resolvedCustomerName = String(customerName || studentName || "").trim();
      if (resolvedCustomerName) existing.customerName = resolvedCustomerName;
    } else {
      existing.customerName = undefined;
    }

    if (quantity !== undefined) {
      const q = Number(quantity);
      if (!Number.isFinite(q) || !Number.isInteger(q) || q < 1) {
        return res.status(400).json({
          message: "Quantity must be an integer at least 1",
        });
      }
      existing.quantity = q;
    }
    if (date) existing.date = new Date(date);

    if (!existing.billSplitRequestId) {
      const pricingSnack = existing.snackId
        ? await SnackProduct.findById(existing.snackId).select("price").lean()
        : null;
      existing.chargedAmount =
        Number(existing.quantity || 0) * Number(pricingSnack?.price || 0);
    }

    await existing.save();

    const populated = await SnackOrder.findById(existing._id)
      .populate("snackId", "name price category")
      .populate("memberId", "name rollNumber roomOwnerName")
      .lean();

    const pricePerItem = Number(populated?.snackId?.price || 0);
    const totalPrice = resolveSnackOrderTotal(populated);
    res.json({
      ...populated,
      snackItem: populated?.snackId?.name || "",
      pricePerItem,
      totalPrice,
      memberName: !existing.isOutsideCustomer ? populated?.memberId?.name : undefined,
      customerName: existing.isOutsideCustomer ? populated?.customerName : undefined,
    });
  } catch (error) {
    console.error("Update snack order (admin) error:", error);
    res.status(500).json({ message: "Failed to update snack order" });
  }
});

// DELETE /api/snack-orders/:id - delete a snack order (admin)
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await SnackOrder.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Snack order not found" });
    }

    res.json({ message: "Snack order deleted successfully" });
  } catch (error) {
    console.error("Delete snack order (admin) error:", error);
    res.status(500).json({ message: "Failed to delete snack order" });
  }
});

module.exports = router;

