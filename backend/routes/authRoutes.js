const express = require("express");
const bcrypt = require("bcrypt");
const supabase = require("../config/supabase");

const router = express.Router();

/* =========================================================
   LOGIN
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
        "id, username, password_hash, role, email"
      )
      .eq("username", username.trim())
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

    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password_hash
      );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
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
   GET USER ACCOUNTS
   Admin dashboard / User Management
   ========================================================= */

router.get("/users", async (req, res) => {

  try {

    const {
      data: users,
      error
    } = await supabase
      .from("user_accounts")
      .select(`
        id,
        username,
        role,
        email
      `)
      .order("id", {
        ascending: true
      });

    if (error) {

      console.error(
        "Supabase user accounts error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load user accounts."
      });
    }

    return res.json({
      success: true,
      users: users || []
    });

  } catch (error) {

    console.error(
      "User accounts error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Something went wrong while loading user accounts."
    });
  }
});


module.exports = router;