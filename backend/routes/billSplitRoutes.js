const express = require("express");
const mongoose = require("mongoose");

const BillSplitRequest = require("../models/BillSplitRequest");
const Member = require("../models/Member");
const SnackProduct = require("../models/SnackProduct");
const SnackOrder = require("../models/SnackOrder");
const { applyPurchaseReferences } = require("../utils/snackOrderReference");
const {
  decrementStockForOrderRows,
  incrementSnackProductStock,
} = require("../utils/snackStock");

const { authenticate, requireMember } = require("../middleware/authMiddleware");

const router = express.Router();

// 1 minute approval window
const SPLIT_APPROVAL_TIMEOUT_MS = 60 * 1000;

function uniqueNonEmpty(arr) {
  return Array.from(
    new Set(arr.map((x) => (x ? String(x) : "")).filter(Boolean))
  );
}

function allocateOrderItemsByAmount(orderItems, participants, snackMap) {
  const memberCount = Number(participants?.length || 0);
  if (memberCount <= 0) return new Map();

  const memberStates = participants.map((mid) => ({
    memberId: String(mid),
    totalAmount: 0,
    itemQtyBySnack: new Map(),
  }));

  const units = [];
  for (const { snackId, quantity } of orderItems) {
    const q = Number(quantity || 0);
    if (!snackId || q < 1) continue;
    const snack = snackMap.get(String(snackId));
    const unitPrice = Number(snack?.price || 0);
    for (let i = 0; i < q; i += 1) {
      units.push({ snackId: String(snackId), unitPrice });
    }
  }

  // Higher priced units are assigned first to reduce final amount imbalance.
  units.sort((a, b) => b.unitPrice - a.unitPrice);

  let tieBreakCursor = 0;
  units.forEach((unit) => {
    let minAmount = Number.POSITIVE_INFINITY;
    for (const st of memberStates) {
      if (st.totalAmount < minAmount) minAmount = st.totalAmount;
    }

    const candidates = [];
    memberStates.forEach((st, idx) => {
      if (Math.abs(st.totalAmount - minAmount) < 1e-9) {
        candidates.push(idx);
      }
    });

    if (!candidates.length) return;

    let chosenIdx = candidates[0];
    for (let offset = 0; offset < memberCount; offset += 1) {
      const idx = (tieBreakCursor + offset) % memberCount;
      if (candidates.includes(idx)) {
        chosenIdx = idx;
        break;
      }
    }

    const chosen = memberStates[chosenIdx];
    chosen.totalAmount += Number(unit.unitPrice || 0);
    const prevQty = Number(chosen.itemQtyBySnack.get(unit.snackId) || 0);
    chosen.itemQtyBySnack.set(unit.snackId, prevQty + 1);
    tieBreakCursor = (chosenIdx + 1) % memberCount;
  });

  const allocationsByMemberId = new Map();
  memberStates.forEach((st) => {
    const items = Array.from(st.itemQtyBySnack.entries()).map(([snackId, quantity]) => {
      const snack = snackMap.get(String(snackId));
      return {
        snackId,
        quantity,
        unitPrice: Number(snack?.price || 0),
      };
    });
    allocationsByMemberId.set(st.memberId, items);
  });

  return allocationsByMemberId;
}

function splitAmountEvenly(totalAmount, count) {
  const c = Number(count || 0);
  const totalCents = Math.round(Number(totalAmount || 0) * 100);
  if (!Number.isFinite(totalCents) || c <= 0) return [];
  const base = Math.floor(totalCents / c);
  const remainder = totalCents % c;
  const out = [];
  for (let i = 0; i < c; i += 1) {
    out.push((base + (i < remainder ? 1 : 0)) / 100);
  }
  return out;
}

function distributeChargedAmounts(items, targetAmount) {
  const t = Math.round(Number(targetAmount || 0) * 100);
  const rawCents = items.map((it) =>
    Math.round(Number(it?.unitPrice || 0) * Number(it?.quantity || 0) * 100)
  );
  const totalRaw = rawCents.reduce((a, b) => a + b, 0);
  if (items.length === 0 || t <= 0 || totalRaw <= 0) {
    return items.map(() => 0);
  }

  const base = rawCents.map((rc) => Math.floor((rc * t) / totalRaw));
  let assigned = base.reduce((a, b) => a + b, 0);
  let remaining = Math.max(0, t - assigned);

  const fracOrder = rawCents
    .map((rc, idx) => ({
      idx,
      frac: (rc * t) / totalRaw - base[idx],
    }))
    .sort((a, b) => b.frac - a.frac);

  let ptr = 0;
  while (remaining > 0 && fracOrder.length > 0) {
    base[fracOrder[ptr % fracOrder.length].idx] += 1;
    remaining -= 1;
    ptr += 1;
  }

  return base.map((c) => c / 100);
}

function buildMemberShareItems(allocation, snackMap) {
  const sourceItems = Array.isArray(allocation?.items) ? allocation.items : [];
  const normalized = sourceItems
    .filter((it) => it?.snackId && Number(it?.quantity || 0) > 0)
    .map((it) => {
      const snack = snackMap.get(String(it.snackId));
      return {
        snackId: String(it.snackId),
        name: snack?.name || "Snack",
        quantity: Number(it.quantity || 0),
        price: Number((it?.unitPrice ?? snack?.price) || 0),
      };
    });

  const chargedTotals = distributeChargedAmounts(
    normalized.map((it) => ({
      snackId: it.snackId,
      quantity: it.quantity,
      unitPrice: it.price,
    })),
    Number(allocation?.allocatedAmount || 0)
  );

  return normalized.map((it, idx) => ({
    ...it,
    total: Number(chargedTotals[idx] || 0),
  }));
}

function isBillSplitExpired(requestDoc) {
  const createdAt = requestDoc?.createdAt ? new Date(requestDoc.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
  return Date.now() - createdAt.getTime() > SPLIT_APPROVAL_TIMEOUT_MS;
}

async function ensureApprovedAllocationOrders(requestDoc, options = {}) {
  const session = options?.session;
  if (!requestDoc?._id) return;

  const existingOrders = await SnackOrder.find({
    billSplitRequestId: requestDoc._id,
  })
    .select("memberId")
    .lean()
    .session(session || undefined);

  const membersWithOrders = new Set(
    existingOrders
      .map((o) => (o?.memberId ? String(o.memberId) : ""))
      .filter(Boolean)
  );

  const approvedAllocations = (requestDoc.allocations || []).filter(
    (a) =>
      String(a?.status || "") === "Approved" &&
      Array.isArray(a?.items) &&
      a.items.length > 0
  );

  for (const allocation of approvedAllocations) {
    const memberIdStr = allocation?.memberId ? String(allocation.memberId) : "";
    if (!memberIdStr || membersWithOrders.has(memberIdStr)) continue;

    const perOrderChargedAmounts = distributeChargedAmounts(
      allocation.items,
      allocation.allocatedAmount
    );
    const orders = allocation.items.map((it) => ({
      memberId: memberIdStr,
      snackId: it.snackId,
      quantity: it.quantity,
      chargedAmount: Number(perOrderChargedAmounts.shift() || 0),
      date: requestDoc.orderDate,
      isOutsideCustomer: false,
      customerName: undefined,
      billSplitRequestId: requestDoc._id,
      commonOrderId: String(requestDoc._id),
      splitMemberIds: Array.isArray(requestDoc.participants)
        ? requestDoc.participants
        : [],
    }));

    const insertedOrders = await SnackOrder.insertMany(orders, { session });
    await applyPurchaseReferences(SnackOrder, insertedOrders, { session });
    membersWithOrders.add(memberIdStr);
  }
}

async function failBillSplitRequest(requestDoc, options = {}) {
  const session = options?.session;
  if (!requestDoc || requestDoc.status === "Failed") return requestDoc;

  requestDoc.status = "Failed";

  // Preserve already-approved allocations; mark only unresolved ones as rejected.
  if (Array.isArray(requestDoc.allocations)) {
    requestDoc.allocations.forEach((a) => {
      if (String(a?.status || "") !== "Approved") {
        a.status = "Rejected";
        a.approvedAt = undefined;
      }
    });
  }

  await requestDoc.save(session ? { session } : undefined);

  // Restore inventory from the original order payload (deducted once at request creation).
  const restoreBySnack = new Map();
  for (const o of requestDoc.orderItems || []) {
    const sid = o?.snackId ? String(o.snackId) : "";
    const q = Number(o?.quantity || 0);
    if (!sid || q < 1) continue;
    restoreBySnack.set(sid, (restoreBySnack.get(sid) || 0) + q);
  }

  for (const [sid, q] of restoreBySnack) {
    await incrementSnackProductStock(
      SnackProduct,
      sid,
      q,
      session ? { session } : undefined
    );
  }

  // Delete snack orders created for this split request.
  await SnackOrder.deleteMany(
    { billSplitRequestId: requestDoc._id },
    session ? { session } : undefined
  );

  return requestDoc;
}

// POST /api/bill-splits/request
// Creates a request and auto-approves creator's share.
router.post("/request", authenticate, requireMember, async (req, res) => {
  try {
    const createdById = req.member?._id;

    const { orderItems, splitMemberIds, date } = req.body || {};
    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({ message: "orderItems is required" });
    }

    const requestedSplitIds = uniqueNonEmpty(splitMemberIds || []);

    // Must be valid Mongo IDs; we validate early to fail fast.
    if (
      requestedSplitIds.some(
        (id) => !mongoose.Types.ObjectId.isValid(String(id))
      )
    ) {
      return res.status(400).json({ message: "Invalid splitMemberIds" });
    }

    const participants = [String(createdById), ...requestedSplitIds].filter(
      (id, idx, arr) => arr.indexOf(id) === idx
    );

    if (participants.length < 2) {
      return res
        .status(400)
        .json({ message: "Please select at least one other member to split" });
    }

    // Validate that provided split members exist.
    if (requestedSplitIds.length > 0) {
      const members = await Member.find({ _id: { $in: requestedSplitIds } })
        .select("_id")
        .lean();
      const found = new Set(members.map((m) => String(m._id)));
      const missing = requestedSplitIds.filter((id) => !found.has(String(id)));
      if (missing.length > 0) {
        return res
          .status(404)
          .json({ message: "Some split members not found" });
      }
    }

    const orderDate = date ? new Date(date) : new Date();
    if (Number.isNaN(orderDate.getTime())) {
      return res.status(400).json({ message: "Invalid date" });
    }

    // Resolve snack IDs & validate quantities.
    const cleanedOrderItems = orderItems
      .map((it) => {
        const snackId = it?.snackId ? String(it.snackId) : "";
        const quantity = Number(it?.quantity);
        return { snackId, quantity };
      })
      .filter(
        (it) =>
          it.snackId &&
          Number.isFinite(it.quantity) &&
          Number.isInteger(it.quantity) &&
          it.quantity > 0
      );

    if (cleanedOrderItems.length === 0) {
      return res.status(400).json({ message: "No valid orderItems found" });
    }

    // Validate snack IDs exist (also ensures refs are valid).
    const snackIds = uniqueNonEmpty(cleanedOrderItems.map((x) => x.snackId));
    const snacks = await SnackProduct.find({ _id: { $in: snackIds } })
      .select("_id name availability quantity price")
      .lean();
    const snackMap = new Map(snacks.map((s) => [String(s._id), s]));
    const snackFoundSet = new Set(snacks.map((s) => String(s._id)));
    const missingSnackIds = snackIds.filter((id) => !snackFoundSet.has(id));
    if (missingSnackIds.length > 0) {
      return res.status(404).json({ message: "Some snacks not found" });
    }

    // Enforce stock/availability limits for the requested quantities.
    for (const { snackId, quantity } of cleanedOrderItems) {
      const snack = snackMap.get(String(snackId));
      if (!snack) continue;
      if (!snack.availability) {
        return res.status(400).json({ message: `Snack ${snack.name} is not available` });
      }
      const availableStock = Number(snack.quantity);
      if (Number.isFinite(availableStock) && quantity > availableStock) {
        return res.status(400).json({
          message: `Insufficient stock for ${snack.name}. Available: ${availableStock}`,
        });
      }
    }

    // For split flow, each participant receives the same order-item details.
    // Amount is still split evenly; item rows are duplicated per participant.
    const fullItemsForEachParticipant = cleanedOrderItems.map((it) => {
      const snack = snackMap.get(String(it.snackId));
      return {
        snackId: it.snackId,
        quantity: it.quantity,
        unitPrice: Number(snack?.price || 0),
      };
    });
    const totalOrderAmount = cleanedOrderItems.reduce((sum, it) => {
      const snack = snackMap.get(String(it.snackId));
      return sum + Number(it.quantity || 0) * Number(snack?.price || 0);
    }, 0);
    const allocatedAmounts = splitAmountEvenly(totalOrderAmount, participants.length);

    const createdByKey = String(createdById);

    const allocations = participants.map((mid, idx) => ({
      memberId: mid,
      items: fullItemsForEachParticipant.map((it) => ({ ...it })),
      allocatedAmount: Number(allocatedAmounts[idx] || 0),
      status: String(mid) === createdByKey ? "Approved" : "Pending",
      approvedAt: String(mid) === createdByKey ? new Date() : undefined,
    }));

    let request;
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const created = await BillSplitRequest.create(
        [
          {
            createdBy: createdById,
            orderDate,
            orderItems: cleanedOrderItems.map((it) => ({
              snackId: it.snackId,
              quantity: it.quantity,
            })),
            participants,
            allocations,
            status: "Active",
          },
        ],
        { session }
      );
      request = created?.[0];

      // Deduct stock once for the real order items (not once per split participant).
      const stockRows = cleanedOrderItems.map((it) => ({
        snackId: it.snackId,
        quantity: it.quantity,
      }));
      const stockPrep = await decrementStockForOrderRows(SnackProduct, stockRows, {
        session,
      });
      if (!stockPrep.ok) {
        throw new Error("Could not update snack stock");
      }

      // Create snack orders for all split members up-front using their allocated items.
      const ordersForAllParticipants = [];
      for (const allocation of allocations) {
        const memberIdStr = allocation?.memberId ? String(allocation.memberId) : "";
        if (!memberIdStr || !Array.isArray(allocation?.items) || !allocation.items.length) {
          continue;
        }
        const perOrderChargedAmounts = distributeChargedAmounts(
          allocation.items,
          allocation.allocatedAmount
        );
        for (const it of allocation.items) {
          ordersForAllParticipants.push({
            memberId: memberIdStr,
            snackId: it.snackId,
            quantity: it.quantity,
            chargedAmount: Number(perOrderChargedAmounts.shift() || 0),
            date: request.orderDate,
            isOutsideCustomer: false,
            customerName: undefined,
            billSplitRequestId: request._id,
            commonOrderId: String(request._id),
            splitMemberIds: participants,
          });
        }
      }

      if (ordersForAllParticipants.length > 0) {
        const inserted = await SnackOrder.insertMany(ordersForAllParticipants, { session });
        await applyPurchaseReferences(SnackOrder, inserted, { session });
      }

      await session.commitTransaction();
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }

    res.status(201).json({
      _id: request._id,
      status: request.status,
      orderDate: request.orderDate,
      participants,
    });
  } catch (error) {
    console.error("Create bill split request error:", error);
    res.status(500).json({ message: "Failed to create bill split request" });
  }
});

// GET /api/bill-splits/pending - pending approvals for current member
router.get("/pending", authenticate, requireMember, async (req, res) => {
  try {
    const memberId = req.member?._id;

    const requests = await BillSplitRequest.find({
      status: "Active",
      allocations: { $elemMatch: { memberId, status: "Pending" } },
      // Don't show expired split requests to other members.
      createdAt: { $gt: new Date(Date.now() - SPLIT_APPROVAL_TIMEOUT_MS) },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!requests.length) {
      return res.json({ pending: [], count: 0 });
    }

    const requesterIds = uniqueNonEmpty(requests.map((r) => r.createdBy));
    const requesters = await Member.find({ _id: { $in: requesterIds } })
      .select("_id name rollNumber")
      .lean();
    const requesterMap = new Map(
      requesters.map((m) => [String(m._id), { name: m.name, rollNumber: m.rollNumber }])
    );

    // Snack totals for *this member* (only current member allocation).
    const snackIds = uniqueNonEmpty(
      requests.flatMap((r) => {
        const alloc = (r.allocations || []).find(
          (a) => String(a.memberId) === String(memberId) && a.status === "Pending"
        );
        return (alloc?.items || []).map((it) => String(it.snackId));
      })
    );

    const snacks = snackIds.length
      ? await SnackProduct.find({ _id: { $in: snackIds } })
          .select("_id name price")
          .lean()
      : [];
    const snackMap = new Map(snacks.map((s) => [String(s._id), s]));

    const pending = requests.map((r) => {
      const alloc = (r.allocations || []).find(
        (a) => String(a.memberId) === String(memberId) && a.status === "Pending"
      );

      const items = buildMemberShareItems(alloc, snackMap);

      const memberShareTotal =
        Number(alloc?.allocatedAmount || 0) ||
        items.reduce((sum, it) => sum + Number(it.total || 0), 0);
      const requester = requesterMap.get(String(r.createdBy)) || {};

      return {
        _id: String(r._id),
        createdAt: r.createdAt,
        requester: {
          id: String(r.createdBy),
          name: requester.name || "Member",
          rollNumber: requester.rollNumber || "",
        },
        orderDate: r.orderDate,
        memberShareTotal,
        memberShareItems: items,
      };
    });

    res.json({ pending, count: pending.length });
  } catch (error) {
    console.error("Get pending bill splits error:", error);
    res.status(500).json({ message: "Failed to fetch pending bill splits" });
  }
});

// GET /api/bill-splits/notifications - pending approvals + resolved history
router.get("/notifications", authenticate, requireMember, async (req, res) => {
  try {
    const memberId = req.member?._id;
    const limitRaw = req.query?.limit;
    const limitNum = Number(limitRaw);
    const safeLimit =
      Number.isFinite(limitNum) && limitNum > 0 ? Math.min(limitNum, 50) : 25;

    const requests = await BillSplitRequest.find({
      allocations: { $elemMatch: { memberId } },
    })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();

    if (!requests.length) {
      return res.json({ notifications: [], count: 0, pendingCount: 0 });
    }

    const requesterIds = uniqueNonEmpty(requests.map((r) => r.createdBy));
    const requesters = await Member.find({ _id: { $in: requesterIds } })
      .select("_id name rollNumber")
      .lean();

    const requesterMap = new Map(
      requesters.map((m) => [String(m._id), { name: m.name, rollNumber: m.rollNumber }])
    );

    const snackIds = uniqueNonEmpty(
      requests.flatMap((r) => {
        const alloc = (r.allocations || []).find(
          (a) => String(a.memberId) === String(memberId)
        );
        return (alloc?.items || [])
          .filter((it) => it?.snackId && Number(it?.quantity || 0) > 0)
          .map((it) => String(it.snackId));
      })
    );

    const snacks = snackIds.length
      ? await SnackProduct.find({ _id: { $in: snackIds } })
          .select("_id name price")
          .lean()
      : [];

    const snackMap = new Map(snacks.map((s) => [String(s._id), s]));

    const notifications = requests.map((r) => {
      const alloc = (r.allocations || []).find(
        (a) => String(a.memberId) === String(memberId)
      );

      const requestStatus = r.status || "Active";
      const allocationStatus = alloc?.status || "Pending";
      const isExpired = isBillSplitExpired(r);
      const isActionable =
        allocationStatus === "Pending" &&
        requestStatus === "Active" &&
        !isExpired;

      const items = buildMemberShareItems(alloc, snackMap);

      const memberShareTotal =
        Number(alloc?.allocatedAmount || 0) ||
        items.reduce((sum, it) => sum + Number(it.total || 0), 0);

      const requester = requesterMap.get(String(r.createdBy)) || {};

      return {
        _id: String(r._id),
        createdAt: r.createdAt,
        orderDate: r.orderDate,
        requester: {
          id: String(r.createdBy),
          name: requester.name || "Member",
          rollNumber: requester.rollNumber || "",
        },
        memberShareTotal,
        memberShareItems: items,
        allocationStatus,
        allocationApprovedAt: alloc?.approvedAt,
        requestStatus,
        isExpired,
        isActionable,
      };
    });

    const pendingCount = notifications.filter((n) => n.isActionable).length;
    res.json({ notifications, count: notifications.length, pendingCount });
  } catch (error) {
    console.error("Get split notifications error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch split notifications" });
  }
});

// PUT /api/bill-splits/:id/approve
router.put("/:id/approve", authenticate, requireMember, async (req, res) => {
  const memberId = req.member?._id;
  const { id } = req.params;

  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    return res.status(400).json({ message: "Invalid split request id" });
  }

  const request = await BillSplitRequest.findById(id);
  if (!request) {
    return res.status(404).json({ message: "Split request not found" });
  }

  if (request.status !== "Active") {
    return res.status(409).json({
      message: `Split request is not active (status: ${request.status})`,
      status: request.status,
    });
  }

  if (isBillSplitExpired(request)) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const requestInTxn = await BillSplitRequest.findById(id).session(session);
      await failBillSplitRequest(requestInTxn, { session });
      await session.commitTransaction();
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }

    return res.status(409).json({
      message: "Split approval window expired. Split failed.",
      status: "Failed",
    });
  }

  const allocation = (request.allocations || []).find(
    (a) => String(a.memberId) === String(memberId)
  );
  if (!allocation) {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (allocation.status === "Approved") {
    // Backfill safety: if an approved member is missing snack-order rows for this
    // split request, create them now so all approved memberIds are represented.
    try {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();
        const requestInTxn = await BillSplitRequest.findById(id).session(session);
        if (!requestInTxn) {
          await session.abortTransaction();
          return res.status(404).json({ message: "Split request not found" });
        }
        await ensureApprovedAllocationOrders(requestInTxn, { session });
        await session.commitTransaction();
        return res.json({ message: "Already approved", status: requestInTxn.status });
      } catch (e) {
        await session.abortTransaction();
        throw e;
      } finally {
        session.endSession();
      }
    } catch (error) {
      console.error("Approve bill split backfill error:", error);
      return res.status(500).json({ message: "Failed to backfill approved split orders" });
    }
  }

  if (allocation.status !== "Pending") {
    return res.status(403).json({
      message: `Cannot approve allocation in status: ${allocation.status}`,
      status: request.status,
    });
  }

  try {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      // Re-load inside the transaction to make the write based on current state.
      const requestInTxn = await BillSplitRequest.findById(id).session(session);
      if (!requestInTxn) throw new Error("Split request not found in txn");

      const allocationInTxn = (requestInTxn.allocations || []).find(
        (a) => String(a.memberId) === String(memberId)
      );
      if (!allocationInTxn) {
        await session.abortTransaction();
        return res.status(403).json({ message: "Forbidden" });
      }

      // If status changed between read and txn, refuse to continue.
      if (requestInTxn.status !== "Active") {
        await session.abortTransaction();
        return res.status(409).json({
          message: `Split request is not active (status: ${requestInTxn.status})`,
          status: requestInTxn.status,
        });
      }

      if (allocationInTxn.status !== "Pending") {
        await session.abortTransaction();
        return res.status(403).json({
          message: `Cannot approve allocation in status: ${allocationInTxn.status}`,
          status: requestInTxn.status,
        });
      }

      allocationInTxn.status = "Approved";
      allocationInTxn.approvedAt = new Date();

      // Ensure every approved member has corresponding snack orders.
      // This is idempotent and also backfills any previously missed records.
      await ensureApprovedAllocationOrders(requestInTxn, { session });

      const allApproved = (requestInTxn.allocations || []).every(
        (a) => String(a.status) === "Approved"
      );
      if (allApproved) requestInTxn.status = "Completed";

      await requestInTxn.save({ session });
      await session.commitTransaction();

      return res.json({ message: "Approved", status: requestInTxn.status });
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("Approve bill split error:", error);
    return res.status(500).json({ message: "Failed to approve bill split" });
  }
});

// PUT /api/bill-splits/:id/reject
// Any rejection fails the whole split (including creator's auto-orders).
router.put("/:id/reject", authenticate, requireMember, async (req, res) => {
  const memberId = req.member?._id;
  const { id } = req.params;

  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    return res.status(400).json({ message: "Invalid split request id" });
  }

  const request = await BillSplitRequest.findById(id);
  if (!request) {
    return res.status(404).json({ message: "Split request not found" });
  }

  if (request.status !== "Active") {
    return res.status(409).json({
      message: `Split request is not active (status: ${request.status})`,
      status: request.status,
    });
  }

  const allocation = (request.allocations || []).find(
    (a) => String(a.memberId) === String(memberId)
  );

  if (!allocation) {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (isBillSplitExpired(request)) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const requestInTxn = await BillSplitRequest.findById(id).session(session);
      if (requestInTxn) await failBillSplitRequest(requestInTxn, { session });
      await session.commitTransaction();
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }

    return res.status(409).json({
      message: "Split approval window expired. Split failed.",
      status: "Failed",
    });
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const requestInTxn = await BillSplitRequest.findById(id).session(session);
    if (!requestInTxn) throw new Error("Split request not found in txn");
    await failBillSplitRequest(requestInTxn, { session });
    await session.commitTransaction();

    return res.json({ message: "Rejected", status: requestInTxn.status });
  } catch (error) {
    console.error("Reject bill split error:", error);
    await session.abortTransaction();
    return res.status(500).json({ message: "Failed to reject bill split" });
  } finally {
    session.endSession();
  }
});

// GET /api/bill-splits/:id - polling endpoint for creator (and participants)
router.get("/:id", authenticate, requireMember, async (req, res) => {
  try {
    const memberId = req.member?._id;
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ message: "Invalid split request id" });
    }

    const request = await BillSplitRequest.findById(id);
    if (!request)
      return res.status(404).json({ message: "Split request not found" });

    const isParticipant = (request.participants || []).some(
      (pid) => String(pid) === String(memberId)
    );
    if (!isParticipant) return res.status(403).json({ message: "Forbidden" });

    let shouldRefreshRequest = false;
    // Expire automatically when poll is hit after timeout.
    if (request.status === "Active" && isBillSplitExpired(request)) {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();
        const requestInTxn = await BillSplitRequest.findById(id).session(session);
        if (requestInTxn) await failBillSplitRequest(requestInTxn, { session });
        await session.commitTransaction();
        shouldRefreshRequest = true;
      } catch (e) {
        await session.abortTransaction();
        throw e;
      } finally {
        session.endSession();
      }
    }

    if (shouldRefreshRequest) {
      const refreshed = await BillSplitRequest.findById(id);
      if (refreshed) {
        request.status = refreshed.status;
        request.orderDate = refreshed.orderDate;
      }
    }

    // Collect snack orders for QR (bulk QR is validated by orderIds).
    const snackOrders = await SnackOrder.find({
      billSplitRequestId: request._id,
    })
      .select("_id memberId")
      .populate("memberId", "name")
      .lean();

    const splitMembers = Array.from(
      new Map(
        snackOrders
          .map((o) => ({
            _id: o?.memberId?._id ? String(o.memberId._id) : "",
            name: String(o?.memberId?.name || "").trim(),
          }))
          .filter((m) => m._id && m.name)
          .map((m) => [m._id, m])
      ).values()
    );

    res.json({
      _id: String(request._id),
      status: request.status,
      orderDate: request.orderDate,
      snackOrderIds: snackOrders.map((o) => String(o._id)),
      splitMembers,
    });
  } catch (error) {
    console.error("Get bill split status error:", error);
    res.status(500).json({ message: "Failed to fetch split status" });
  }
});

module.exports = router;

