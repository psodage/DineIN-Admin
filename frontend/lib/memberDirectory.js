const normalizeMember = (candidate) => {
  if (!candidate) return null;
  const id = candidate._id || candidate.id;
  if (!id) return null;
  return {
    _id: String(id),
    name: candidate.name || "",
    nameMr: candidate.nameMr || candidate.name || "",
    rollNumber: candidate.rollNumber || "",
    roomNumber: candidate.roomNumber || "",
    roomOwnerName: candidate.roomOwnerName || candidate.roomNumber || "",
    roomOwnerNameMr:
      candidate.roomOwnerNameMr ||
      candidate.roomOwnerName ||
      candidate.roomNumber ||
      "",
    phone: candidate.phone || "",
    email: candidate.email || candidate.userId?.email || "",
    userId: candidate.userId || null,
    joiningDate: candidate.joiningDate || null,
    mealPlan: candidate.mealPlan || "",
    mealPlanPrice: Number(candidate.mealPlanPrice || 0),
    totalMessFee: candidate.totalMessFee,
    status: candidate.status || "",
  };
};

const toUniqueMembers = (rows) => {
  const map = new Map();
  for (const row of rows || []) {
    const m = normalizeMember(row);
    if (!m) continue;
    if (!map.has(m._id)) map.set(m._id, m);
  }
  return Array.from(map.values());
};

export const fetchMemberDirectory = async (api) => {
  const sources = [];

  try {
    const res = await api.get("/api/members");
    const direct = toUniqueMembers(res?.data);
    if (direct.length > 0) return direct;
  } catch (_) {
    // Fallbacks below cover projects where /api/members was removed.
  }

  try {
    const paymentsRes = await api.get("/api/payments");
    const payments = Array.isArray(paymentsRes?.data) ? paymentsRes.data : [];
    const inferred = payments
      .map((p) => p?.memberId)
      .filter((m) => m && typeof m === "object");
    sources.push(...inferred);
  } catch (_) {}

  try {
    const leavesRes = await api.get("/api/leave/all");
    const leaves = Array.isArray(leavesRes?.data) ? leavesRes.data : [];
    const inferred = leaves
      .map((l) => l?.memberId)
      .filter((m) => m && typeof m === "object");
    sources.push(...inferred);
  } catch (_) {}

  try {
    const snacksRes = await api.get("/api/snacks");
    const snacks = Array.isArray(snacksRes?.data) ? snacksRes.data : [];
    const inferred = snacks
      .map((s) => s?.memberId)
      .filter((m) => m && typeof m === "object");
    sources.push(...inferred);
  } catch (_) {}

  return toUniqueMembers(sources);
};
