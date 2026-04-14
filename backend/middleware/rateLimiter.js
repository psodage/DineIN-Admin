/**
 * Simple in-memory rate limiter for OTP requests.
 * In production, consider using redis-based rate limiting (e.g. express-rate-limit with Redis store).
 */

const otpAttempts = new Map();
const OTP_RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const OTP_MAX_REQUESTS_PER_WINDOW = 3;

function otpRateLimiter(req, res, next) {
  const identifier = req.body?.email
    ? req.body.email.toLowerCase().trim()
    : req.ip || "unknown";

  const now = Date.now();
  let record = otpAttempts.get(identifier);

  if (!record) {
    record = { count: 1, firstRequest: now };
    otpAttempts.set(identifier, record);
  } else {
    // Reset window if expired
    if (now - record.firstRequest > OTP_RATE_LIMIT_WINDOW_MS) {
      record = { count: 1, firstRequest: now };
      otpAttempts.set(identifier, record);
    } else {
      record.count += 1;
    }
  }

  if (record.count > OTP_MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      message: "Too many OTP requests. Please try again later.",
    });
  }

  next();
}

module.exports = { otpRateLimiter };
