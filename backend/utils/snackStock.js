const mongoose = require("mongoose");

function toObjectId(snackId) {
  if (!snackId) return null;
  const s = String(snackId);
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

/**
 * Decrement SnackProduct.quantity when inventory is tracked (finite number).
 * Non-finite quantity = unlimited — no DB change.
 * Uses atomic { quantity: { $gte: q } } + $inc to reduce race issues.
 */
async function decrementSnackProductStock(SnackProduct, snackId, deductQty) {
  const options = arguments.length >= 4 ? arguments[3] : undefined;
  const session = options?.session;
  const id = toObjectId(snackId);
  const q = Number(deductQty);
  if (!id || !Number.isFinite(q) || q < 1) return { ok: true, skipped: true };

  let snackQuery = SnackProduct.findById(id);
  if (session) snackQuery = snackQuery.session(session);
  const snack = await snackQuery.lean();
  if (!snack) return { ok: false, reason: "not_found" };

  const availableStock = Number(snack.quantity);
  if (!Number.isFinite(availableStock)) return { ok: true, skipped: true };

  const res = await SnackProduct.updateOne(
    { _id: id, quantity: { $gte: q } },
    { $inc: { quantity: -q } },
    session ? { session } : undefined
  );
  return { ok: res.modifiedCount === 1, skipped: false };
}

/** Restore stock (e.g. order deleted). Only when inventory is tracked. */
async function incrementSnackProductStock(SnackProduct, snackId, addQty) {
  const options = arguments.length >= 4 ? arguments[3] : undefined;
  const session = options?.session;
  const id = toObjectId(snackId);
  const q = Number(addQty);
  if (!id || !Number.isFinite(q) || q < 1) return;

  let snackQuery = SnackProduct.findById(id);
  if (session) snackQuery = snackQuery.session(session);
  const snack = await snackQuery.lean();
  if (!snack) return;
  const availableStock = Number(snack.quantity);
  if (!Number.isFinite(availableStock)) return;

  await SnackProduct.updateOne(
    { _id: id },
    { $inc: { quantity: q } },
    session ? { session } : undefined
  );
}

/**
 * Decrement stock for multiple order rows (quantities aggregated per snackId).
 * Rolls back prior decrements in this call if any step fails.
 */
async function decrementStockForOrderRows(SnackProduct, orderRows) {
  const options = arguments.length >= 3 ? arguments[2] : undefined;
  const session = options?.session;
  const deductBySnack = new Map();
  for (const row of orderRows) {
    const sid = String(row.snackId);
    const q = Number(row.quantity) || 0;
    if (!sid || q < 1) continue;
    deductBySnack.set(sid, (deductBySnack.get(sid) || 0) + q);
  }
  const decremented = [];
  for (const [sid, totalDeduct] of deductBySnack) {
    const stockResult = await decrementSnackProductStock(
      SnackProduct,
      sid,
      totalDeduct,
      session ? { session } : undefined
    );
    if (!stockResult.ok && !stockResult.skipped) {
      for (const [rsid, rq] of decremented) {
        await incrementSnackProductStock(
          SnackProduct,
          rsid,
          rq,
          session ? { session } : undefined
        );
      }
      return { ok: false, decremented: [] };
    }
    if (!stockResult.skipped) decremented.push([sid, totalDeduct]);
  }
  return { ok: true, decremented };
}

async function restoreDecrementedStock(SnackProduct, decremented) {
  const options = arguments.length >= 3 ? arguments[2] : undefined;
  const session = options?.session;
  for (const [sid, q] of decremented) {
    await incrementSnackProductStock(
      SnackProduct,
      sid,
      q,
      session ? { session } : undefined
    );
  }
}

module.exports = {
  decrementSnackProductStock,
  incrementSnackProductStock,
  decrementStockForOrderRows,
  restoreDecrementedStock,
};
