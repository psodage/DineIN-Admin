/* eslint-disable no-console */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const connectDB = require("../config/db");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const SnackProduct = require("../models/SnackProduct");
const Member = require("../models/Member");

function normalizeMealPlan(mealPlan) {
  const mp = String(mealPlan || "").trim().toLowerCase();
  if (mp === "dinner") return "Dinner";
  if (mp === "both") return "Both";
  // Default to Lunch for unknown/empty
  return "Lunch";
}

function isBcryptHash(s) {
  const v = String(s || "");
  return v.startsWith("$2a$") || v.startsWith("$2b$") || v.startsWith("$2y$");
}

async function main() {
  await connectDB();
  const db = mongoose.connection.db;

  console.log("Starting normalization migration...");

  // 1) Members: create missing User(role=member) records, set Member.userId, and remove auth/fee fields.
  const membersColl = db.collection("members");
  const snackOrdersColl = db.collection("snackorders");
  const paymentsColl = db.collection("payments");
  const leaveRequestsColl = db.collection("leaverequests");
  const leavesColl = db.collection("leaves");
  const duesColl = db.collection("dues");

  const allSnackProducts = await SnackProduct.find().lean();
  const productIdByNameLower = new Map(
    allSnackProducts.map((p) => [String(p.name || "").toLowerCase(), p._id])
  );

  let membersUpdated = 0;
  let membersSkippedNoEmail = 0;

  const memberCursor = membersColl.find({});
  for await (const m of memberCursor) {
    const memberId = m._id;

    const emailRaw = m.email ? String(m.email).trim().toLowerCase() : "";
    if (!emailRaw) {
      membersSkippedNoEmail += 1;
      continue;
    }

    const existingUser = await User.findOne({ email: emailRaw, role: "member" }).lean();

    let userId = existingUser?._id;
    if (!userId) {
      const pwdRaw = m.password ? String(m.password) : String(m.phone || "");
      const passwordToStore = isBcryptHash(pwdRaw) ? pwdRaw : await bcrypt.hash(pwdRaw, 10);

      const user = await User.create({
        email: emailRaw,
        password: passwordToStore,
        role: "member",
        activeSessionToken: null,
      });

      userId = user._id;
    }

    await membersColl.updateOne(
      { _id: memberId },
      {
        $set: {
          userId,
          mealPlan: normalizeMealPlan(m.mealPlan),
        },
        $unset: {
          email: "",
          password: "",
          activeSessionToken: "",
          totalMessFee: "",
          dueAmount: "",
          snackdueamount: "",
        },
      }
    );
    membersUpdated += 1;
  }

  console.log(`Members updated: ${membersUpdated}, skipped (no email): ${membersSkippedNoEmail}`);

  // 2) Snack orders: remove studentName/snackItem/pricePerItem/totalPrice, add customerName for outside orders,
  //    ensure snackId is populated from snackItem name if missing.
  let snackOrdersUpdated = 0;
  const snackCursor = snackOrdersColl.find({});
  for await (const o of snackCursor) {
    const orderId = o._id;

    const outside = !!o.isOutsideCustomer;
    const resolvedSnackId =
      o.snackId ||
      (o.snackItem ? productIdByNameLower.get(String(o.snackItem).trim().toLowerCase()) : undefined);

    const customerName = outside
      ? String(o.customerName || o.studentName || "").trim() || undefined
      : undefined;

    const update = {
      $set: {
        ...(resolvedSnackId ? { snackId: resolvedSnackId } : {}),
        ...(outside ? { customerName } : { customerName: undefined }),
      },
      $unset: {
        studentName: "",
        snackItem: "",
        pricePerItem: "",
        totalPrice: "",
      },
    };

    await snackOrdersColl.updateOne({ _id: orderId }, update);
    snackOrdersUpdated += 1;
  }

  console.log(`Snack orders updated: ${snackOrdersUpdated}`);

  // 3) Payments: rename studentId -> memberId, remove studentName and stored totals/status.
  let paymentsUpdated = 0;
  const paymentCursor = paymentsColl.find({});
  for await (const p of paymentCursor) {
    const paymentId = p._id;
    const memberId = p.memberId || p.studentId;
    if (!memberId) continue;

    await paymentsColl.updateOne(
      { _id: paymentId },
      {
        $set: { memberId },
        $unset: {
          studentId: "",
          studentName: "",
          totalMessFee: "",
          remainingAmount: "",
          status: "",
        },
      }
    );
    paymentsUpdated += 1;
  }

  console.log(`Payments updated: ${paymentsUpdated}`);

  // 4) LeaveRequest: rename studentId -> memberId, remove studentName.
  let leaveRequestsUpdated = 0;
  const leaveReqCursor = leaveRequestsColl.find({});
  for await (const lr of leaveReqCursor) {
    const reqId = lr._id;
    const memberId = lr.memberId || lr.studentId;
    if (!memberId) continue;

    await leaveRequestsColl.updateOne(
      { _id: reqId },
      {
        $set: { memberId },
        $unset: { studentId: "", studentName: "" },
      }
    );
    leaveRequestsUpdated += 1;
  }

  console.log(`Leave requests updated: ${leaveRequestsUpdated}`);

  // 5) LeaveStat: remove memberName and totalMessBill fields.
  let leaveStatsUpdated = 0;
  const leaveStatsCursor = leavesColl.find({});
  for await (const ls of leaveStatsCursor) {
    await leavesColl.updateOne(
      { _id: ls._id },
      {
        $unset: {
          memberName: "",
          totalMessBill: "",
        },
      }
    );
    leaveStatsUpdated += 1;
  }
  console.log(`Leave stats updated: ${leaveStatsUpdated}`);

  // 6) Due: remove computed fields.
  let duesUpdated = 0;
  const dueCursor = duesColl.find({});
  for await (const d of dueCursor) {
    await duesColl.updateOne(
      { _id: d._id },
      {
        $unset: {
          memberName: "",
          rollNumber: "",
          totalDue: "",
        },
      }
    );
    duesUpdated += 1;
  }
  console.log(`Due records updated: ${duesUpdated}`);

  console.log("Normalization migration complete.");
}

main()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });

