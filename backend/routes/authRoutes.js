const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");

const {
  createAuditLog,
} = require("../controllers/auditLogController");
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");

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
   ========================================================= */

router.post("/login", async (req, res) => {
  try {
    const {
      username,
      password
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required.",
      });
    }

    const {
      data: user,
      error
    } = await supabase
      .from("user_accounts")
      .select(
        "id, username, password_hash, role, email, account_status"
      )
      .eq(
        "username",
        username.trim()
      )
      .maybeSingle();

    if (error) {
      console.error(
        "Supabase login error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Unable to process login.",
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }


    /* -----------------------------------------
       Block inactive accounts
       ----------------------------------------- */

    if (
      user.account_status ===
      "Inactive"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "This account has been disabled. Please contact the administrator.",
      });
    }


    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password_hash
      );


    if (!passwordMatch) {
      await createAuditLog({
        username: username.trim(),
        action: "LOGIN_FAILED",
        entityType: "USER",
        details: "Failed login attempt due to invalid credentials.",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

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

    return res.json({
      success: true,

      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        account_status:
          user.account_status ||
          "Active",
      },
    });

  } catch (error) {

    console.error(
      "Login error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Something went wrong during login.",
    });

  }
});


/* =========================================================
   GET ALL USER ACCOUNTS
   GET /api/auth/users
   ========================================================= */

router.get("/users", authenticateToken, requireAdmin, async (req, res) => {

  try {

    const {
      data: users,
      error
    } = await supabase
      .from("user_accounts")
      .select(
        "id, username, email, role, account_status"
      )
      .order(
        "id",
        {
          ascending: true
        }
      );


    if (error) {

      console.error(
        "Supabase users fetch error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load user accounts.",
      });

    }


    return res.json({
      success: true,
      users:
        (users || []).map(
          user => ({
            id: user.id,
            username: user.username,
            email:
              user.email || "",
            role:
              user.role || "Staff",
            account_status:
              user.account_status ||
              "Active",
          })
        )
    });

  } catch (error) {

    console.error(
      "Get users error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Something went wrong while loading user accounts.",
    });

  }

});


/* =========================================================
   CREATE USER
   POST /api/auth/users
   ========================================================= */

router.post("/users", authenticateToken, requireAdmin, async (req, res) => {

  try {

    const {
      username,
      password,
      email,
      role,
      account_status
    } = req.body;


    const cleanUsername =
      String(
        username || ""
      ).trim();


    const cleanEmail =
      String(
        email || ""
      ).trim();


    const cleanRole =
      String(
        role || "Staff"
      ).trim();


    const cleanStatus =
      account_status ===
      "Inactive"
        ? "Inactive"
        : "Active";


    if (!cleanUsername) {

      return res.status(400).json({
        success: false,
        message:
          "Username is required.",
      });

    }


    if (!password) {

      return res.status(400).json({
        success: false,
        message:
          "Password is required.",
      });

    }


    if (
      !isStrongPassword(
        password
      )
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters and include at least one capital letter, one number, and one special character.",
      });

    }


    const allowedRoles = [
      "Admin",
      "Staff",
      "ID Maker"
    ];


    if (
      !allowedRoles.includes(
        cleanRole
      )
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Invalid user role.",
      });

    }


    /* -----------------------------------------
       Check duplicate username
       ----------------------------------------- */

    const {
      data: existingUser,
      error: existingError
    } = await supabase
      .from("user_accounts")
      .select("id")
      .eq(
        "username",
        cleanUsername
      )
      .maybeSingle();


    if (existingError) {

      console.error(
        "Duplicate username check error:",
        existingError
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to validate username.",
      });

    }


    if (existingUser) {

      return res.status(409).json({
        success: false,
        message:
          "Username already exists.",
      });

    }


    /* -----------------------------------------
       Hash password
       ----------------------------------------- */

    const passwordHash =
      await bcrypt.hash(
        password,
        10
      );


    /* -----------------------------------------
       Insert account
       ----------------------------------------- */

    const {
      data: newUser,
      error
    } = await supabase
      .from("user_accounts")
      .insert({
        username:
          cleanUsername,

        password_hash:
          passwordHash,

        role:
          cleanRole,

        email:
          cleanEmail || null,

        account_status:
          cleanStatus
      })
      .select(
        "id, username, email, role, account_status"
      )
      .single();


    if (error) {

      console.error(
        "Supabase create user error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to create user account.",
      });

    }

    await createAuditLog({
      username: data.username,
      role: data.role,
      action: "USER_CREATED",
      entityType: "USER",
      entityId: String(data.id),
      details: `Created user account: ${data.username}`,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(201).json({
      success: true,
      message:
        "User account created successfully.",
      user: newUser
    });

  } catch (error) {

    console.error(
      "Create user error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Something went wrong while creating the user account.",
    });

  }

});


/* =========================================================
   UPDATE USER
   PUT /api/auth/users/:id
   ========================================================= */

router.put("/users/:id", authenticateToken, requireAdmin, async (req, res) => {

    try {

      const userId =
        req.params.id;


      const {
        username,
        email,
        role,
        account_status,
        password
      } = req.body;


      const updateData = {};


      if (
        username !==
        undefined
      ) {

        const cleanUsername =
          String(
            username
          ).trim();


        if (!cleanUsername) {

          return res.status(400).json({
            success: false,
            message:
              "Username cannot be empty.",
          });

        }


        updateData.username =
          cleanUsername;

      }


      if (
        email !==
        undefined
      ) {

        updateData.email =
          String(
            email || ""
          ).trim() ||
          null;

      }


      if (
        role !==
        undefined
      ) {

        const allowedRoles = [
          "Admin",
          "Staff",
          "ID Maker"
        ];


        if (
          !allowedRoles.includes(
            role
          )
        ) {

          return res.status(400).json({
            success: false,
            message:
              "Invalid user role.",
          });

        }


        updateData.role =
          role;

      }


      if (
        account_status !==
        undefined
      ) {

        if (
          ![
            "Active",
            "Inactive"
          ].includes(
            account_status
          )
        ) {

          return res.status(400).json({
            success: false,
            message:
              "Invalid account status.",
          });

        }


        updateData.account_status =
          account_status;

      }


      /* -----------------------------------------
         Optional password update
         ----------------------------------------- */

      if (
        password !==
          undefined &&
        password !==
          ""
      ) {

        if (
          !isStrongPassword(
            password
          )
        ) {

          return res.status(400).json({
            success: false,
            message:
              "Password must be at least 8 characters and include at least one capital letter, one number, and one special character.",
          });

        }


        updateData.password_hash =
          await bcrypt.hash(
            password,
            10
          );

      }


      if (
        Object.keys(
          updateData
        ).length === 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "No changes were provided.",
        });

      }


      const {
        data: updatedUser,
        error
      } = await supabase
        .from("user_accounts")
        .update(
          updateData
        )
        .eq(
          "id",
          userId
        )
        .select(
          "id, username, email, role, account_status"
        )
        .single();


      if (error) {

        console.error(
          "Supabase update user error:",
          error
        );

        return res.status(500).json({
          success: false,
          message:
            "Unable to update user account.",
        });

      }

      await createAuditLog({
        username: data.username,
        role: data.role,
        action: "USER_UPDATED",
        entityType: "USER",
        entityId: String(data.id),
        details: `Updated user account: ${data.username}`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      return res.json({
        success: true,
        message:
          "User account updated successfully.",
        user:
          updatedUser
      });

    } catch (error) {

      console.error(
        "Update user error:",
        error
      );

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
   ========================================================= */

router.put("/users/:id/password", authenticateToken, requireAdmin, async (req, res) => {

    try {

      const userId =
        req.params.id;


      const {
        password
      } = req.body;


      if (!password) {

        return res.status(400).json({
          success: false,
          message:
            "Password is required.",
        });

      }


      if (
        !isStrongPassword(
          password
        )
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Password must be at least 8 characters and include at least one capital letter, one number, and one special character.",
        });

      }


      const passwordHash =
        await bcrypt.hash(
          password,
          10
        );


      const {
        error
      } = await supabase
        .from("user_accounts")
        .update({
          password_hash:
            passwordHash
        })
        .eq(
          "id",
          userId
        );


      if (error) {

        console.error(
          "Supabase password reset error:",
          error
        );

        return res.status(500).json({
          success: false,
          message:
            "Unable to reset password.",
        });

      }

      await createAuditLog({
        username: data.username,
        role: data.role,
        action: "PASSWORD_RESET",
        entityType: "USER",
        entityId: String(data.id),
        details: `Password reset for user: ${data.username}`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      return res.json({
        success: true,
        message:
          "Password reset successfully."
      });

    } catch (error) {

      console.error(
        "Reset password error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Something went wrong while resetting the password.",
      });

    }

  }
);


/* =========================================================
   ENABLE / DISABLE USER
   PUT /api/auth/users/:id/status
   ========================================================= */

router.put("/users/:id/status", authenticateToken, requireAdmin, async (req, res) => {

    try {

      const userId =
        req.params.id;


      const {
        account_status
      } = req.body;


      if (
        ![
          "Active",
          "Inactive"
        ].includes(
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
        error
      } = await supabase
        .from("user_accounts")
        .update({
          account_status
        })
        .eq(
          "id",
          userId
        )
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

      await createAuditLog({
        username: data.username,
        role: data.role,
        action:
          data.account_status === "Active"
            ? "USER_ACTIVATED"
            : "USER_DEACTIVATED",
        entityType: "USER",
        entityId: String(data.id),
        details:
          data.account_status === "Active"
            ? `Activated user account: ${data.username}`
            : `Deactivated user account: ${data.username}`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      return res.json({
        success: true,
        message:
          `Account ${account_status.toLowerCase()} successfully.`,
        user:
          updatedUser
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


module.exports = router;