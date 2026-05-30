const path = require("path");
const os = require("os");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const { seedMealTypes } = require("./utils/seedMealTypes");
const {
  startMemberMonthlyDueDailyScheduler,
} = require("./jobs/memberMonthlyDueDailyJob");
const { startMongoBackupDailyScheduler } = require("./jobs/mongoBackupJob");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1); // needed on Render/Railway for correct req.ip behind proxy

connectDB();
seedMealTypes()
  .then(() => {
    console.log("MealType seed ready");
  })
  .catch((err) => {
    console.error("MealType seed failed:", err?.message || err);
  });

const corsOriginEnv = process.env.CORS_ORIGIN;
const corsOptions = {
  origin:
    !corsOriginEnv || corsOriginEnv === "*"
      ? "*"
      : corsOriginEnv.split(",").map((s) => s.trim()).filter(Boolean),
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/members", require("./routes/memberRoutes"));
app.use("/api/students", require("./routes/studentRoutes"));
app.use("/api/menu", require("./routes/menuRoutes"));
app.use("/api/polls", require("./routes/pollRoutes"));
app.use("/api/expenses", require("./routes/expenseRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/leave", require("./routes/leaveRoutes"));
app.use("/api/pending-registrations", require("./routes/pendingRegistrationRoutes"));
app.use("/api/bill-splits", require("./routes/billSplitRoutes"));
app.use("/api/snacks", require("./routes/snackRoutes"));
app.use("/api/snack-products", require("./routes/snackProductRoutes"));
app.use("/api/backups", require("./routes/backupRoutes"));

const PORT = process.env.PORT || 5000;

/** IPv4 LAN addresses (for logs / mobile dev); bind stays 0.0.0.0 to accept all interfaces. */
function getLanIPv4Addresses() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return [...new Set(ips)];
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT} (all interfaces)`);
  console.log(`  Local:   http://127.0.0.1:${PORT}`);
  const lanIps = getLanIPv4Addresses();
  if (lanIps.length) {
    for (const ip of lanIps) {
      console.log(`  Network: http://${ip}:${PORT}`);
    }
  } else {
    console.log("  Network: (no LAN IPv4 detected — use 127.0.0.1 on this machine)");
  }
  const hasEmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  console.log(`Nodemailer (Gmail SMTP) configured: ${hasEmail ? "yes" : "no"}`);
  startMemberMonthlyDueDailyScheduler();
  startMongoBackupDailyScheduler();
});