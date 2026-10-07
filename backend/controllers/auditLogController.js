const supabase = require("../config/supabase");

async function createAuditLog({
  userId = null,
  username = null,
  role = null,
  action,
  entityType = null,
  entityId = null,
  details = null,
  ipAddress = null,
  userAgent = null,
}) {
  try {
    const { error } = await supabase
      .from("audit_logs")
      .insert({
        user_id: userId,
        username,
        role,
        action,
        entity_type: entityType,
        entity_id: entityId,
        details,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

    if (error) {
      console.error("Audit log insert error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Audit log exception:", error);
    return false;
  }
}

async function getAuditLogs(req, res) {
  try {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 100, 1),
      500
    );

    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Get audit logs error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to load audit logs.",
      });
    }

    return res.json({
      success: true,
      logs: data || [],
    });
  } catch (error) {
    console.error("Audit logs error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while loading audit logs.",
    });
  }
}

module.exports = {
  createAuditLog,
  getAuditLogs,
};