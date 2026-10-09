const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const supabase = require("../config/supabase");
const { createAuditLog } = require("../controllers/auditLogController");

const router = express.Router();

/* =========================================================
   DIAGNOSTIC — POST /api/auth/test-email
   Checks env vars, SMTP connection, user lookup, and sends
   a real test email. REMOVE after debugging is done.
   ========================================================= */

router.post("/test-email", async (req, res) => {
  const results = {};

  // 1. Env var check
  results.envVars = {
    SMTP_HOST:    process.env.SMTP_HOST    || "❌ MISSING",
    SMTP_PORT:    process.env.SMTP_PORT    || "❌ MISSING",
    SMTP_SECURE:  process.env.SMTP_SECURE  || "❌ MISSING",
    SMTP_USER:    process.env.SMTP_USER    || "❌ MISSING",
    SMTP_PASS:    process.env.SMTP_PASS    ? "✅ SET (hidden)" : "❌ MISSING",
    FRONTEND_URL: process.env.FRONTEND_URL || "❌ MISSING",
  };

  // 2. SMTP connection test
  try {
    const transport = createMailTransport();
    await transport.verify();
    results.smtp = "✅ SMTP connection OK";
  } catch (err) {
    results.smtp = "❌ SMTP FAILED: " + err.message;
  }

  // 3. User lookup in Supabase
  const { identifier } = req.body;
  if (identifier) {
    const clean = String(identifier).trim().toLowerCase();
    try {
      const { data: user, error } = await supabase
        .from("user_accounts")
        .select("id, username, email, account_status")
        .or(`username.eq.${clean},email.eq.${clean}`)
        .maybeSingle();
      if (error) {
        results.userLookup = "❌ Supabase error: " + error.message;
      } else if (!user) {
        results.userLookup = "❌ NOT FOUND — no user_accounts row matches that username/email";
      } else {
        results.userLookup = {
          found: true,
          username: user.username,
          email: user.email || "❌ NO EMAIL SET on this account",
          status: user.account_status,
        };
      }
    } catch (err) {
      results.userLookup = "❌ Exception: " + err.message;
    }
  } else {
    results.userLookup = "⚠️ No identifier sent in request body";
  }

  // 3b. DB table check — does password_reset_tokens exist and is it accessible?
  try {
    const { error: tableError } = await supabase
      .from("password_reset_tokens")
      .select("id")
      .limit(1);
    if (tableError) {
      results.dbTable = "❌ password_reset_tokens ERROR: " + tableError.message;
    } else {
      results.dbTable = "✅ password_reset_tokens table is accessible";
    }
  } catch (err) {
    results.dbTable = "❌ password_reset_tokens EXCEPTION: " + err.message;
  }

  // 4. Send real test email if both SMTP and user are OK
  const userEmail = results.userLookup?.email;
  const smtpOk = results.smtp?.startsWith("✅");
  const emailIsReal = userEmail && !userEmail.startsWith("❌");

  if (smtpOk && emailIsReal) {
    try {
      const transport = createMailTransport();
      await transport.sendMail({
        from: `"OSCA Bauan System" <${process.env.SMTP_USER}>`,
        to: userEmail,
        subject: "OSCA System — Diagnostic Test Email",
        text: `This is a test email from the OSCA password reset system.\n\nIf you received this, email sending is working correctly!\n\n— OSCA Bauan`,
      });
      results.emailSend = "✅ Test email sent to " + userEmail;
    } catch (err) {
      results.emailSend = "❌ Email send FAILED: " + err.message;
    }
  } else {
    results.emailSend = "⏭️ Skipped (SMTP or user email not ready)";
  }

  return res.json(results);
});

/* =========================================================
   CONSTANTS
   ========================================================= */

const RESET_TOKEN_EXPIRY_MINUTES = 30;
const FRONTEND_BASE_URL =
  process.env.FRONTEND_URL ||
  "https://record-management-system-black.vercel.app";

/* =========================================================
   EMAIL TRANSPORT
   Uses env vars so credentials stay out of source code.
   Supported: Gmail (with App Password) or any SMTP provider.
   ========================================================= */

function createMailTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/* =========================================================
   PASSWORD VALIDATION  (mirrors authRoutes.js)
   ========================================================= */

function isStrongPassword(password) {
  const value = String(password || "");
  return (
    value.length >= 8 &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

/* =========================================================
   POST /api/auth/forgot-password
   Body: { identifier }   — username or email
   ========================================================= */

router.post("/forgot-password", async (req, res) => {
  // Generic response to prevent user enumeration
  const GENERIC_SUCCESS = {
    success: true,
    message:
      "If an account matches that username or email, a password reset link has been sent. Check your inbox (and spam folder).",
  };

  try {
    const { identifier } = req.body;

    if (!identifier || !String(identifier).trim()) {
      return res.status(400).json({
        success: false,
        message: "Please provide your username or email address.",
      });
    }

    const clean = String(identifier).trim().toLowerCase();

    /* ── Look up account by username OR email ── */
    const { data: user, error } = await supabase
      .from("user_accounts")
      .select("id, username, email, account_status")
      .or(`username.eq.${clean},email.eq.${clean}`)
      .maybeSingle();

    if (error) {
      console.error("Forgot password lookup error:", error);
      // Still return generic success to avoid leaking DB errors
      return res.json(GENERIC_SUCCESS);
    }

    // No user found — return generic message (no enumeration)
    if (!user || user.account_status === "Inactive") {
      return res.json(GENERIC_SUCCESS);
    }

    if (!user.email) {
      // Account has no email — log and return generic response
      console.warn(
        `Password reset requested for account without email: ${user.username}`
      );
      return res.json(GENERIC_SUCCESS);
    }

    /* ── Generate a cryptographically secure token ── */
    const rawToken = crypto.randomBytes(32).toString("hex"); // 64-char hex
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000
    ).toISOString();

    /* ── Invalidate any existing unused tokens for this user ── */
    await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("used_at", null);

    /* ── Store the hashed token ── */
    const { error: insertError } = await supabase
      .from("password_reset_tokens")
      .insert({
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("Token insert error:", insertError);
      return res.json(GENERIC_SUCCESS);
    }

    /* ── Build reset link ── */
    const resetLink = `${FRONTEND_BASE_URL}/reset-password.html?token=${rawToken}`;

    /* ── Send email ── */
    try {
      const transport = createMailTransport();

      await transport.sendMail({
        from: `"OSCA Bauan System" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: "Password Reset Request — OSCA Bauan",
        html: buildResetEmailHTML(user.username, resetLink, RESET_TOKEN_EXPIRY_MINUTES),
        text: buildResetEmailText(user.username, resetLink, RESET_TOKEN_EXPIRY_MINUTES),
      });
    } catch (mailError) {
      console.error("Email send error:", mailError);
      // Don't expose mail errors; the token is saved so admin can still use it
    }

    /* ── Audit log ── */
    await createAuditLog({
      userId: user.id,
      username: user.username,
      action: "PASSWORD_RESET_REQUESTED",
      entityType: "USER",
      entityId: String(user.id),
      details: "Password reset email requested.",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.json(GENERIC_SUCCESS);
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.json({
      success: true,
      message:
        "If an account matches that username or email, a password reset link has been sent. Check your inbox (and spam folder).",
    });
  }
});

/* =========================================================
   POST /api/auth/reset-password
   Body: { token, password }
   ========================================================= */

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required.",
      });
    }

    /* ── Validate password complexity ── */
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters and include at least one uppercase letter, one number, and one special character.",
      });
    }

    /* ── Hash the incoming raw token and look it up ── */
    const tokenHash = crypto
      .createHash("sha256")
      .update(String(token))
      .digest("hex");

    const { data: record, error } = await supabase
      .from("password_reset_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      console.error("Token lookup error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to process your request. Please try again.",
      });
    }

    /* ── Token validity checks ── */
    if (!record) {
      return res.status(400).json({
        success: false,
        message: "Invalid or unrecognised reset link.",
      });
    }

    if (record.used_at) {
      return res.status(400).json({
        success: false,
        message: "This reset link has already been used.",
      });
    }

    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "This reset link has expired. Please request a new one.",
      });
    }

    /* ── Fetch user ── */
    const { data: user, error: userError } = await supabase
      .from("user_accounts")
      .select("id, username, email, account_status")
      .eq("id", record.user_id)
      .maybeSingle();

    if (userError || !user) {
      return res.status(400).json({
        success: false,
        message: "Associated account not found.",
      });
    }

    if (user.account_status === "Inactive") {
      return res.status(403).json({
        success: false,
        message:
          "This account has been disabled. Contact the administrator.",
      });
    }

    /* ── Hash and update the password ── */
    const passwordHash = await bcrypt.hash(password, 12);

    const { error: updateError } = await supabase
      .from("user_accounts")
      .update({ password_hash: passwordHash })
      .eq("id", user.id);

    if (updateError) {
      console.error("Password update error:", updateError);
      return res.status(500).json({
        success: false,
        message: "Unable to update password. Please try again.",
      });
    }

    /* ── Invalidate the token ── */
    await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", record.id);

    /* ── Audit log ── */
    await createAuditLog({
      userId: user.id,
      username: user.username,
      action: "PASSWORD_RESET",
      entityType: "USER",
      entityId: String(user.id),
      details: "Password successfully reset via reset link.",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.json({
      success: true,
      message: "Password updated successfully. You can now sign in.",
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
});

/* =========================================================
   GET /api/auth/verify-reset-token?token=XYZ
   Lightweight check — is the token still valid?
   ========================================================= */

router.get("/verify-reset-token", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ valid: false, message: "Token required." });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(String(token))
      .digest("hex");

    const { data: record } = await supabase
      .from("password_reset_tokens")
      .select("expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
      return res.json({ valid: false, message: "Token is invalid or expired." });
    }

    return res.json({ valid: true });
  } catch (err) {
    console.error("Verify token error:", err);
    return res.json({ valid: false, message: "Unable to verify token." });
  }
});

/* =========================================================
   EMAIL TEMPLATE HELPERS
   ========================================================= */

function buildResetEmailHTML(username, resetLink, expiryMinutes) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Password Reset</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1E40AF,#2563EB);padding:36px 40px;text-align:center;">
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.8);letter-spacing:1px;text-transform:uppercase;">Office of the Senior Citizens Affairs</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;">Municipality of Bauan</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 12px;color:#1E293B;font-size:20px;font-weight:700;">Password Reset Request</h2>
              <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
                Hello <strong>${username}</strong>,<br/><br/>
                We received a request to reset the password for your account. Click the button below to set a new password.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${resetLink}" style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.3px;">
                  Reset My Password
                </a>
              </div>
              <p style="margin:0 0 8px;color:#64748B;font-size:13px;line-height:1.6;">
                This link will expire in <strong>${expiryMinutes} minutes</strong>. If you did not request a password reset, please ignore this email — your account remains secure.
              </p>
              <p style="margin:16px 0 0;color:#94A3B8;font-size:12px;">
                If the button doesn't work, copy and paste this link into your browser:<br/>
                <span style="color:#2563EB;word-break:break-all;">${resetLink}</span>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#94A3B8;font-size:12px;">
                © ${new Date().getFullYear()} OSCA — Municipality of Bauan &nbsp;|&nbsp; This is an automated message, please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildResetEmailText(username, resetLink, expiryMinutes) {
  return `Password Reset Request — OSCA Bauan

Hello ${username},

We received a request to reset the password for your account.

Reset your password by visiting:
${resetLink}

This link expires in ${expiryMinutes} minutes.

If you did not request this, ignore this email. Your account remains secure.

— Office of the Senior Citizens Affairs, Municipality of Bauan`;
}

module.exports = router;
