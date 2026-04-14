const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1); // needed on Render/Railway for correct req.ip behind proxy

connectDB();

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
app.use("/api/menu", require("./routes/menuRoutes"));
app.use("/api/polls", require("./routes/pollRoutes"));
app.use("/api/expenses", require("./routes/expenseRoutes"));
app.use("/api/snacks", require("./routes/snackRoutes"));
app.use("/api/snack-products", require("./routes/snackProductRoutes"));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  const hasEmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  console.log(`Nodemailer (Gmail SMTP) configured: ${hasEmail ? "yes" : "no"}`);
});