const jwt = require("jsonwebtoken");
const Member = require("../models/Member");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { statusMrFor, mealPlanMrFor } = require("../utils/memberLabelsMr");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  return "secretkey";
}

function signMemberToken(memberId) {
  return jwt.sign({ id: memberId, role: "member" }, getJwtSecret(), {
    expiresIn: "1d",
  });
}

exports.memberLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail, role: "member" });
    if (!user) return res.status(400).json({ message: "Member not found" });

    const stored = String(user.password || "");
    const input = String(password || "");
    const looksHashed =
      stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$");

    const ok = looksHashed ? await bcrypt.compare(input, stored) : stored.trim() === input.trim();
    if (!ok) return res.status(400).json({ message: "Invalid credentials" });

    const member = await Member.findOne({ userId: user._id }).lean();
    if (!member) return res.status(400).json({ message: "Member not found" });

    const token = signMemberToken(member._id);

    // Single active session: overwrite any previous token.
    user.activeSessionToken = token;
    await user.save();

    return res.json({
      token,
      user: {
        id: member._id,
        email: user.email,
        name: member.name,
        roomOwnerName: member.roomOwnerName,
        mealPlan: member.mealPlan,
        mealPlanMr: member.mealPlanMr || mealPlanMrFor(member.mealPlan),
        status: member.status,
        statusMr: member.statusMr || statusMrFor(member.status),
        role: "member",
      },
    });
  } catch (error) {
    console.error("Member login error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.memberLogout = async (req, res) => {
  try {
    // auth middleware guarantees req.user exists and token matches activeSessionToken
    if (req.user) {
      req.user.activeSessionToken = null;
      await req.user.save();
    }

    return res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Member logout error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

