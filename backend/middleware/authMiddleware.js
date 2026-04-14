const jwt = require("jsonwebtoken");
const User = require("../models/User");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  return "secretkey";
}

function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header) return null;
  const value = String(header);
  if (!value.toLowerCase().startsWith("bearer ")) return null;
  return value.slice(7).trim();
}

exports.authenticate = (req, res, next) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const payload = jwt.verify(token, getJwtSecret());
    const roleRaw = payload?.role;
    const role =
      typeof roleRaw === "string" ? roleRaw.trim().toLowerCase() : roleRaw;
    req.auth = { token, id: payload?.id, role };

    if (!req.auth.id || !req.auth.role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

exports.requireMember = async (req, res, next) => {
  try {
    if (!req.auth) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (req.auth.role !== "member") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const user = await User.findById(req.auth.id);
    if (!user || user.role !== "member") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!user.activeSessionToken || user.activeSessionToken !== req.auth.token) {
      return res.status(401).json({
        message: "Session expired. You have logged in on another device.",
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error("Member auth middleware error:", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

exports.requireAdmin = async (req, res, next) => {
  try {
    if (!req.auth) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (req.auth.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const user = await User.findById(req.auth.id).lean();
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

exports.ensureSelfParam = (paramName) => (req, res, next) => {
  const value = req.params?.[paramName];
  if (!value) {
    return res.status(400).json({ message: `${paramName} is required` });
  }
  if (!req.auth?.id || String(value) !== String(req.auth.id)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  return next();
};

exports.ensureSelfBody = (fieldName) => (req, res, next) => {
  const value =
    req.body?.[fieldName] ??
    (fieldName === "studentId" ? req.body?.memberId : undefined) ??
    (fieldName === "memberId" ? req.body?.studentId : undefined);
  if (!value) {
    return res.status(400).json({ message: `${fieldName} is required` });
  }
  if (!req.auth?.id || String(value) !== String(req.auth.id)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  return next();
};

