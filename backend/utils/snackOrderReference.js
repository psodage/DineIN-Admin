const mongoose = require("mongoose");

/**
 * Persist `purchaseReference` (= Mongo _id string) on snack orders.
 * `insertMany` does not run save hooks, so call this after bulk inserts.
 */
async function applyPurchaseReferences(
  SnackOrderModel,
  docsOrIds,
  options = {}
) {
  const session = options?.session;
  const list = Array.isArray(docsOrIds) ? docsOrIds : [docsOrIds];
  const ops = [];
  for (const item of list) {
    const id = item?._id ?? item;
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) continue;
    const sid = new mongoose.Types.ObjectId(String(id));
    ops.push({
      updateOne: {
        filter: { _id: sid },
        update: { $set: { purchaseReference: String(sid) } },
      },
    });
  }
  if (ops.length) {
    await SnackOrderModel.bulkWrite(ops, {
      ordered: false,
      ...(session ? { session } : null),
    });
  }
}

module.exports = { applyPurchaseReferences };
