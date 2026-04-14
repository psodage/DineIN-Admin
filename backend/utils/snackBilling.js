const SnackOrder = require("../models/SnackOrder");

// Count orders for a given member in the month of `monthDate`
async function getSnackTotalForMonth(memberId, monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

  const orders = await SnackOrder.find({
    memberId,
    isOutsideCustomer: false,
    date: {
      $gte: startOfMonth,
      $lte: endOfMonth,
    },
  }).populate("snackId", "price").lean();

  return orders.reduce((sum, o) => {
    const charged = Number(o?.chargedAmount);
    if (Number.isFinite(charged)) return sum + charged;
    const price = Number(o?.snackId?.price || 0);
    const qty = Number(o?.quantity || 0);
    return sum + qty * price;
  }, 0);
}

module.exports = { getSnackTotalForMonth };

