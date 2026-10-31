const express = require("express");
const supabase = require("../config/supabase");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");
const { createAuditLog } = require("../controllers/auditLogController");
const router = express.Router();
const DEFAULT_SETTINGS = { system_name: "Record Management System", organization_name: "Office of the Senior Citizens Affairs", allow_public_registration: true };

router.get("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from("system_settings").select("system_name, organization_name, allow_public_registration, updated_at").eq("id", 1).maybeSingle();
    if (error) { console.error("[System Settings] Read error:", error); return res.status(500).json({ success: false, message: "Unable to load system settings. Apply database migration 004 first." }); }
    return res.json({ success: true, settings: { ...DEFAULT_SETTINGS, ...(data || {}) } });
  } catch (error) { console.error("[System Settings] Read failed:", error); return res.status(500).json({ success: false, message: "Unable to load system settings." }); }
});

router.put("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const system_name = String(req.body.system_name || "").trim();
    const organization_name = String(req.body.organization_name || "").trim();
    const allow_public_registration = req.body.allow_public_registration;
    if (!system_name || system_name.length > 100) return res.status(400).json({ success: false, message: "System name is required and must be 100 characters or fewer." });
    if (!organization_name || organization_name.length > 150) return res.status(400).json({ success: false, message: "Organization name is required and must be 150 characters or fewer." });
    if (typeof allow_public_registration !== "boolean") return res.status(400).json({ success: false, message: "Registration access setting must be true or false." });
    const { data, error } = await supabase.from("system_settings").upsert({ id: 1, system_name, organization_name, allow_public_registration, updated_by: req.user.id, updated_at: new Date().toISOString() }, { onConflict: "id" }).select("system_name, organization_name, allow_public_registration, updated_at").single();
    if (error) { console.error("[System Settings] Save error:", error); return res.status(500).json({ success: false, message: "Unable to save settings. Apply database migration 004 first." }); }
    await createAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: "SYSTEM_SETTINGS_UPDATED", entityType: "SYSTEM", entityId: "1", details: "Updated general system information and public registration access.", ipAddress: req.ip, userAgent: req.get("user-agent") });
    return res.json({ success: true, message: "System settings saved successfully.", settings: data });
  } catch (error) { console.error("[System Settings] Save failed:", error); return res.status(500).json({ success: false, message: "Unable to save system settings." }); }
});
module.exports = router;
