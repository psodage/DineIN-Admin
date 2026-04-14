const nodemailer = require("nodemailer");

const OTP_EXPIRY_MINUTES = 5;

/**
 * Create nodemailer transporter for Gmail SMTP.
 * Requires GMAIL_USER and GMAIL_APP_PASSWORD in .env
 */
function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error("Gmail SMTP not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

/**
 * Send OTP email using Nodemailer.
 * @param {string} to - Recipient email
 * @param {string} otp - 6-digit OTP
 * @returns {Promise<void>}
 */
async function sendOtpEmail(to, otp) {
  const transporter = createTransporter();
  const appName = process.env.APP_NAME || "DineIN";

  const mailOptions = {
    from: `"${appName}" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Your OTP for ${appName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto;">
        <h2 style="color: #111827;">Your One-Time Password</h2>
        <p style="color: #4B5563; font-size: 16px;">Use the following OTP to reset your password:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 8px; color: #000; background: #F3F4F6; padding: 16px; border-radius: 8px; text-align: center;">
          ${otp}
        </p>
        <p style="color: #6B7280; font-size: 14px;">This OTP expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share it with anyone.</p>
        <p style="color: #6B7280; font-size: 12px; margin-top: 24px;">If you did not request this, please ignore this email.</p>
      </div>
    `,
    text: `Your OTP is: ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
  };

  await transporter.sendMail(mailOptions);
}

async function sendMonthlyBillEmail({ to, memberName, monthLabel, total, paid, due }) {
  const transporter = createTransporter();
  const appName = process.env.APP_NAME || "DineIN";

  const mailOptions = {
    from: `"${appName}" <${process.env.GMAIL_USER}>`,
    to,
    subject: `${appName} - ${monthLabel} Bill`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #111827; margin-bottom: 6px;">${monthLabel} Mess Bill</h2>
        <p style="color: #4B5563; font-size: 15px; margin-top: 0;">
          Hello ${String(memberName || "").trim() || "Member"},
        </p>

        <div style="background: #F3F4F6; border-radius: 10px; padding: 14px 16px; margin: 14px 0;">
          <div style="display:flex; justify-content:space-between; padding: 6px 0;">
            <div style="color:#374151;">Total</div>
            <div style="font-weight:700; color:#111827;">₹${Number(total || 0).toLocaleString("en-IN")}</div>
          </div>
          <div style="display:flex; justify-content:space-between; padding: 6px 0;">
            <div style="color:#374151;">Paid</div>
            <div style="font-weight:700; color:#16A34A;">₹${Number(paid || 0).toLocaleString("en-IN")}</div>
          </div>
          <div style="display:flex; justify-content:space-between; padding: 6px 0;">
            <div style="color:#374151;">Due</div>
            <div style="font-weight:800; color:#DC2626;">₹${Number(due || 0).toLocaleString("en-IN")}</div>
          </div>
        </div>

        <p style="color: #6B7280; font-size: 12px; margin-top: 18px;">
          This is an automated email from ${appName}.
        </p>
      </div>
    `,
    text: `${monthLabel} Bill\nTotal: ₹${Number(total || 0)}\nPaid: ₹${Number(paid || 0)}\nDue: ₹${Number(due || 0)}`,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = {
  sendOtpEmail,
  sendMonthlyBillEmail,
  OTP_EXPIRY_MINUTES,
};
