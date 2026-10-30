const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");
const crypto = require("crypto");

const {
  createAuditLog,
} = require("../controllers/auditLogController");

const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();


/* =========================================================
   PASSWORD VALIDATION
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
   LOGIN
   POST /api/auth/login
   ========================================================= */

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required.",
      });
    }

    const { data: user, error } = await supabase
      .from("user_accounts")
      .select(
        "id, username, password_hash, role, email, account_status"
      )
      .eq("username", username.trim())
      .maybeSingle();

    if (error) {
      console.error("Supabase login error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to process login.",
      });
    }

    if (!user) {
      await createAuditLog({
        username: username.trim(),
        action: "LOGIN_FAILED",
        entityType: "USER",
        details: "Failed login attempt for unknown username.",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

    /* -----------------------------------------
       Block inactive accounts
       ----------------------------------------- */

    if (user.account_status === "Inactive") {
      await createAuditLog({
        userId: user.id,
        username: user.username,
        role: user.role,
        action: "LOGIN_BLOCKED",
        entityType: "USER",
        entityId: String(user.id),
        details: "Login blocked because the account is inactive.",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      return res.status(403).json({
        success: false,
        message:
          "This account has been disabled. Please contact the administrator.",
      });
    }

    /* -----------------------------------------
       Verify password
       ----------------------------------------- */

    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      await createAuditLog({
        userId: user.id,
        username: user.username,
        role: user.role,
        action: "LOGIN_FAILED",
        entityType: "USER",
        entityId: String(user.id),
        details: "Failed login attempt due to invalid credentials.",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

    /* -----------------------------------------
       Create JWT
       ----------------------------------------- */

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured.");

      return res.status(500).json({
        success: false,
        message: "Authentication service is not configured.",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "8h",
      }
    );

    /* -----------------------------------------
       Audit successful login
       ----------------------------------------- */

    await createAuditLog({
      userId: user.id,
      username: user.username,
      role: user.role,
      action: "LOGIN",
      entityType: "USER",
      entityId: String(user.id),
      details: "User logged into the system.",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    /* -----------------------------------------
       Login response
       ----------------------------------------- */

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        account_status: user.account_status || "Active",
      },
    });

  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong during login.",
    });
  }
});


/* =========================================================
   CREATE SESSION TOKEN
   ========================================================= */

function createSessionToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "8h",
    }
  );
}


/* =========================================================
   GET MY PROFILE
   GET /api/auth/me

   AUTHENTICATED USER
   ========================================================= */

router.get(
  "/me",
  authenticateToken,
  async (req, res) => {
    try {
      const { data: user, error } = await supabase
        .from("user_accounts")
        .select(
          "id, username, full_name, designation, email, role, account_status"
        )
        .eq("id", req.user.id)
        .maybeSingle();

      if (error) {
        console.error(
          "Supabase profile fetch error:",
          error
        );

        return res.status(500).json({
          success: false,
          message: "Unable to load your profile.",
        });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User account not found.",
        });
      }

      return res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email || "",
          role: user.role || "Staff",
          account_status:
            user.account_status || "Active",
        },
      });

    } catch (error) {
      console.error("Get profile error:", error);

      return res.status(500).json({
        success: false,
        message:
          "Something went wrong while loading your profile.",
      });
    }
  }
);


/* =========================================================
   UPDATE MY PROFILE
   PUT /api/auth/me

   AUTHENTICATED USER
   ========================================================= */

router.put(
  "/me",
  authenticateToken,
  async (req, res) => {
    try {
      const { username, email } = req.body;

      const updateData = {};

      if (username !== undefined) {
        const cleanUsername = String(
          username || ""
        ).trim();

        if (!cleanUsername) {
          return res.status(400).json({
            success: false,
            message: "Username cannot be empty.",
          });
        }

        /* Check duplicate username (excluding self) */

        const {
          data: existingUser,
          error: existingError,
        } = await supabase
          .from("user_accounts")
          .select("id")
          .eq("username", cleanUsername)
          .neq("id", req.user.id)
          .maybeSingle();

        if (existingError) {
          console.error(
            "Profile duplicate username check error:",
            existingError
          );

          return res.status(500).json({
            success: false,
            message: "Unable to validate username.",
          });
        }

        if (existingUser) {
          return res.status(409).json({
            success: false,
            message: "Username already exists.",
          });
        }

        updateData.username = cleanUsername;
      }

      if (email !== undefined) {
        const cleanEmail = String(
          email || ""
        ).trim();

        if (
          cleanEmail &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            cleanEmail
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Please enter a valid email address.",
          });
        }

        updateData.email = cleanEmail || null;
      }

      if (
        Object.keys(updateData).length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "No changes were provided.",
        });
      }

      const {
        data: updatedUser,
        error,
      } = await supabase
        .from("user_accounts")
        .update(updateData)
        .eq("id", req.user.id)
        .select(
          "id, username, email, role, account_status"
        )
        .single();

      if (error) {
        console.error(
          "Supabase profile update error:",
          error
        );

        return res.status(500).json({
          success: false,
          message: "Unable to update your profile.",
        });
      }

      await createAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action: "PROFILE_UPDATED",
        entityType: "USER",
        entityId: String(updatedUser.id),
        details:
          `Updated own profile: ${updatedUser.username}`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      /* Issue a fresh token so the session claims stay in sync. */

      const token = createSessionToken(
        updatedUser
      );

      await createAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action: "PROFILE_UPDATED",
        entityType: "USER",
        entityId: String(req.user.id),
        details: "Updated account profile information.",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      return res.json({
        success: true,
        message: "Profile updated successfully.",
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email || "",
          role: updatedUser.role || "Staff",
          account_status:
            updatedUser.account_status || "Active",
        },
        token,
      });

    } catch (error) {
      console.error("Update profile error:", error);

      return res.status(500).json({
        success: false,
        message:
          "Something went wrong while updating your profile.",
      });
    }
  }
);


/* =========================================================
   GET ALL USER ACCOUNTS
   GET /api/auth/users

   ADMIN ONLY
   ========================================================= */

router.get(
  "/users",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      // Some existing deployments may not have the optional
      // designation column yet. Retry without it so account
      // retrieval does not fail for every user.
      let { data: users, error } = await supabase
        .from("user_accounts")
        .select(
          "id, username, full_name, designation, email, role, account_status"
        )
        .order("id", {
          ascending: true,
        });

      if (
        error &&
        /designation|column .* does not exist|schema cache/i.test(
          error.message || ""
        )
      ) {
        console.warn(
          "[Admin Users] Optional designation column unavailable; retrying without it."
        );

        const fallback = await supabase
          .from("user_accounts")
          .select(
            "id, username, full_name, email, role, account_status"
          )
          .order("id", {
            ascending: true,
          });

        users = fallback.data;
        error = fallback.error;
      }

      if (error) {
        console.error(
          "Supabase users fetch error:",
          error
        );

        return res.status(500).json({
          success: false,
          message: "Unable to load user accounts.",
          // Keep database details in server logs, not the public response.
        });
      }

      return res.json({
        success: true,
        users: (users || []).map((user) => ({
          id: user.id,
          username: user.username,
          full_name: user.full_name || user.username,
          designation: user.designation || null,
          email: user.email || "",
          role: user.role || "Staff",
          account_status:
            user.account_status || "Active",
        })),
      });

    } catch (error) {
      console.error("Get users error:", error);

      return res.status(500).json({
        success: false,
        message:
          "Something went wrong while loading user accounts.",
      });
    }
  }
);


/* =========================================================
   CREATE USER
   POST /api/auth/users

   ADMIN ONLY
   ========================================================= */

router.post(
  "/users",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const {
        username,
        password,
        email,
        role,
        account_status,
        full_name,
        designation,
      } = req.body;

      const cleanUsername = String(
        username || ""
      ).trim();

      const cleanEmail = String(
        email || ""
      ).trim();

      const cleanRole = String(
        role || "Staff"
      ).trim();

      const cleanStatus =
        account_status === "Inactive"
          ? "Inactive"
          : "Active";

      if (!cleanUsername) {
        return res.status(400).json({
          success: false,
          message: "Username is required.",
        });
      }

      if (!password) {
        return res.status(400).json({
          success: false,
          message: "Password is required.",
        });
      }

      if (!isStrongPassword(password)) {
        return res.status(400).json({
          success: false,
          message:
            "Password must be at least 8 characters and include at least one capital letter, one number, and one special character.",
        });
      }

      const allowedRoles = [
        "Admin",
        "Staff",
        "ID Maker",
      ];

      if (!allowedRoles.includes(cleanRole)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user role.",
        });
      }

      /* Check duplicate username */

      const {
        data: existingUser,
        error: existingError,
      } = await supabase
        .from("user_accounts")
        .select("id")
        .eq("username", cleanUsername)
        .maybeSingle();

      if (existingError) {
        console.error(
          "Duplicate username check error:",
          existingError
        );

        return res.status(500).json({
          success: false,
          message: "Unable to validate username.",
        });
      }

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Username already exists.",
        });
      }

      /* Hash password */

      const passwordHash = await bcrypt.hash(
        password,
        10
      );

      /* Insert account */

      const userInsert = {
        username: cleanUsername,
        full_name: String(full_name || cleanUsername).trim(),
        password_hash: passwordHash,
        role: cleanRole === "OSCA ID Maker" ? "ID Maker" : cleanRole,
        email: cleanEmail || null,
        account_status: cleanStatus,
      };

      // designation is optional in older Supabase schemas.
      let insertResult = await supabase
        .from("user_accounts")
        .insert({
          ...userInsert,
          designation: String(designation || "").trim() || null,
        })
        .select(
          "id, username, full_name, designation, email, role, account_status"
        )
        .single();

      if (
        insertResult.error &&
        /designation|column .* does not exist|schema cache/i.test(
          insertResult.error.message || ""
        )
      ) {
        insertResult = await supabase
          .from("user_accounts")
          .insert(userInsert)
          .select(
            "id, username, full_name, email, role, account_status"
          )
          .single();
      }

      const newUser = insertResult.data;
      const error = insertResult.error;

      if (error) {
        console.error(
          "Supabase create user error:",
          error
        );

        return res.status(500).json({
          success: false,
          message: "Unable to create user account.",
        });
      }

      await createAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action: "USER_CREATED",
        entityType: "USER",
        entityId: String(newUser.id),
        details:
          `Created user account: ${newUser.username}`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      return res.status(201).json({
        success: true,
        message: "User account created successfully.",
        user: newUser,
      });

    } catch (error) {
      console.error("Create user error:", error);

      return res.status(500).json({
        success: false,
        message:
          "Something went wrong while creating the user account.",
      });
    }
  }
);


/* =========================================================
   UPDATE USER
   PUT /api/auth/users/:id

   ADMIN ONLY
   ========================================================= */

router.put(
  "/users/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const userId = req.params.id;

      const {
        username,
        email,
        role,
        account_status,
        full_name,
        designation,
      } = req.body;

      if (Object.prototype.hasOwnProperty.call(req.body, "password")) {
        return res.status(403).json({
          success: false,
          message: "Administrators cannot change another user's password.",
        });
      }

      const updateData = {};

      if (full_name !== undefined) {
        const cleanFullName = String(full_name || "").trim();
        if (!cleanFullName) {
          return res.status(400).json({ success: false, message: "Full name cannot be empty." });
        }
        updateData.full_name = cleanFullName;
      }

      if (designation !== undefined) {
        updateData.designation = String(designation || "").trim() || null;
      }

      if (username !== undefined) {
        const cleanUsername =
          String(username).trim();

        if (!cleanUsername) {
          return res.status(400).json({
            success: false,
            message: "Username cannot be empty.",
          });
        }

        updateData.username = cleanUsername;
      }

      if (email !== undefined) {
        updateData.email =
          String(email || "").trim() || null;
      }

      if (role !== undefined) {
        const allowedRoles = [
          "Admin",
          "Staff",
          "ID Maker",
        ];

        if (!allowedRoles.includes(role)) {
          return res.status(400).json({
            success: false,
            message: "Invalid user role.",
          });
        }

        updateData.role = role;
      }

      if (account_status !== undefined) {
        if (
          !["Active", "Inactive"].includes(
            account_status
          )
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid account status.",
          });
        }

        updateData.account_status =
          account_status;
      }

      if (
        Object.keys(updateData).length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "No changes were provided.",
        });
      }

      if (updateData.role === "OSCA ID Maker") {
        updateData.role = "ID Maker";
      }

      let updateResult = await supabase
        .from("user_accounts")
        .update(updateData)
        .eq("id", userId)
        .select(
          "id, username, full_name, designation, email, role, account_status"
        )
        .single();

      if (
        updateResult.error &&
        updateData.designation !== undefined &&
        /designation|column .* does not exist|schema cache/i.test(
          updateResult.error.message || ""
        )
      ) {
        const { designation: omittedDesignation, ...compatibleUpdate } = updateData;
        updateResult = await supabase
          .from("user_accounts")
          .update(compatibleUpdate)
          .eq("id", userId)
          .select(
            "id, username, full_name, email, role, account_status"
          )
          .single();
      }

      const updatedUser = updateResult.data;
      const error = updateResult.error;

      if (error) {
        console.error(
          "Supabase update user error:",
          error
        );

        return res.status(500).json({
          success: false,
          message: "Unable to update user account.",
        });
      }

      await createAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action: "USER_UPDATED",
        entityType: "USER",
        entityId: String(updatedUser.id),
        details:
          `Updated user account: ${updatedUser.username}`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      return res.json({
        success: true,
        message:
          "User account updated successfully.",
        user: updatedUser,
      });

    } catch (error) {
      console.error("Update user error:", error);

      return res.status(500).json({
        success: false,
        message:
          "Something went wrong while updating the user account.",
      });
    }
  }
);


/* =========================================================
   RESET PASSWORD
   PUT /api/auth/users/:id/password

   ADMIN ONLY
   ========================================================= */

router.put(
  "/users/:id/password",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    return res.status(403).json({
      success: false,
      message: "Administrators cannot change another user's password. The account owner must use the password recovery process.",
    });
  }
);

/* =========================================================
   ENABLE / DISABLE USER
   PUT /api/auth/users/:id/status

   ADMIN ONLY
   ========================================================= */

router.put(
  "/users/:id/status",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const userId = req.params.id;
      const { account_status } = req.body;

      if (
        !["Active", "Inactive"].includes(
          account_status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Account status must be Active or Inactive.",
        });
      }

      const {
        data: updatedUser,
        error,
      } = await supabase
        .from("user_accounts")
        .update({
          account_status,
        })
        .eq("id", userId)
        .select(
          "id, username, email, role, account_status"
        )
        .single();

      if (error) {
        console.error(
          "Supabase status update error:",
          error
        );

        return res.status(500).json({
          success: false,
          message:
            "Unable to update account status.",
        });
      }

      const action =
        updatedUser.account_status === "Active"
          ? "USER_ACTIVATED"
          : "USER_DEACTIVATED";

      const details =
        updatedUser.account_status === "Active"
          ? `Activated user account: ${updatedUser.username}`
          : `Deactivated user account: ${updatedUser.username}`;

      await createAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action,
        entityType: "USER",
        entityId: String(updatedUser.id),
        details,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      return res.json({
        success: true,
        message:
          `Account ${account_status.toLowerCase()} successfully.`,
        user: updatedUser,
      });

    } catch (error) {
      console.error(
        "Update account status error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Something went wrong while updating account status.",
      });
    }
  }
);


/* =========================================================
   FORGOT PASSWORD - OTP EMAIL CONFIGURATION
   ========================================================= */


function hashResetOtp(otp) {
  return crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");
}


/* =========================================================
   REQUEST PASSWORD RESET OTP
   POST /api/auth/forgot-password
   Body: { email }
   ========================================================= */

router.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    const { data: user, error } = await supabase
      .from("user_accounts")
      .select("id, username, email, account_status")
      .ilike("email", email)
      .maybeSingle();

    if (error) {
      console.error("Password reset lookup error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to process your request right now.",
      });
    }

    // Use the same response whether or not an account exists.
    if (!user || user.account_status !== "Active") {
      return res.json({
        success: true,
        message:
          "If an active account matches that email, an OTP will be sent.",
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const tokenHash = hashResetOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
      .toISOString();

    // Invalidate any previous unused reset codes for this user.
    const { error: invalidateError } = await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("used_at", null);

    if (invalidateError) {
      console.error("OTP invalidation error:", invalidateError);
      return res.status(500).json({
        success: false,
        message: "Unable to process your request right now.",
      });
    }

    const { error: insertError } = await supabase
      .from("password_reset_tokens")
      .insert({
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("OTP database error:", insertError);
      return res.status(500).json({
        success: false,
        message: "Unable to generate a reset code.",
      });
    }

    try {
      if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
        throw new Error("Brevo API configuration is missing.");
      }

      const emailResponse = await fetch(
        "https://api.brevo.com/v3/smtp/email",
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "api-key": process.env.BREVO_API_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            sender: {
              name: process.env.BREVO_SENDER_NAME || "Record Management System",
              email: process.env.BREVO_SENDER_EMAIL,
            },
            to: [
              {
                email: user.email,
              },
            ],
            subject: "Record Management System - Password Reset OTP",
            textContent:
              `Hello,\n\n` +
              `Your password reset code is: ${otp}\n\n` +
              `This code expires in 10 minutes. If you did not request a password reset, you can ignore this email.\n\n` +
              `Record Management System`,
          }),
        }
      );

      if (!emailResponse.ok) {
        const details = await emailResponse.text();
        throw new Error(
          `Brevo email API failed (${emailResponse.status}): ${details}`
        );
      }

    } catch (mailError) {
      console.error("OTP email sending error:", mailError);

      // Invalidate the code if sending the email failed.
      await supabase
        .from("password_reset_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("token_hash", tokenHash)
        .is("used_at", null);

      return res.status(500).json({
        success: false,
        message: "Unable to send the OTP email. Please try again later.",
      });
    }

    return res.json({
      success: true,
      message:
        "If an active account matches that email, an OTP will be sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });
  }
});


/* =========================================================
   VERIFY OTP AND RESET PASSWORD
   POST /api/auth/reset-password
   Body: { email, otp, newPassword }
   ========================================================= */

router.post("/reset-password", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const otp = String(req.body.otp || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!email || !/^\d{6}$/.test(otp) || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, six-digit OTP, and new password are required.",
      });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters and include an uppercase letter, a number, and a special character.",
      });
    }

    const { data: user, error: userError } = await supabase
      .from("user_accounts")
      .select("id, email, account_status")
      .ilike("email", email)
      .maybeSingle();

    if (userError) {
      console.error("Reset account lookup error:", userError);
      return res.status(500).json({
        success: false,
        message: "Unable to process the password reset.",
      });
    }

    if (!user || user.account_status !== "Active") {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP.",
      });
    }

    const { data: resetToken, error: tokenError } = await supabase
      .from("password_reset_tokens")
      .select("id, token_hash, expires_at")
      .eq("user_id", user.id)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError) {
      console.error("OTP verification lookup error:", tokenError);
      return res.status(500).json({
        success: false,
        message: "Unable to verify the OTP.",
      });
    }

    if (
      !resetToken ||
      resetToken.token_hash !== hashResetOtp(otp)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP.",
      });
    }

    // Hash the new password only after the OTP has been verified.
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Claim the OTP before changing the password to prevent reuse.
    const { data: claimedToken, error: claimError } = await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", resetToken.id)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();

    if (claimError || !claimedToken) {
      if (claimError) {
        console.error("OTP claim error:", claimError);
      }

      return res.status(400).json({
        success: false,
        message: "Invalid, expired, or already used OTP.",
      });
    }

    const { error: passwordError } = await supabase
      .from("user_accounts")
      .update({ password_hash: passwordHash })
      .eq("id", user.id);

    if (passwordError) {
      console.error("Password update error:", passwordError);

      return res.status(500).json({
        success: false,
        message:
          "Unable to update the password. Please request a new OTP.",
      });
    }

    await createAuditLog({
      userId: user.id,
      username: user.username,
      action: "PASSWORD_CHANGED",
      entityType: "USER",
      entityId: String(user.id),
      details: "User changed their password after OTP verification.",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.json({
      success: true,
      message:
        "Password reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });
  }
});


module.exports = router;