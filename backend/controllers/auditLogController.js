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

async function createAuditLogFromRequest(req, {
  action,
  entityType = null,
  entityId = null,
  details = null,
  username = null,
  role = null,
  userId = null,
} = {}) {
  const actor = req.user || {};
  return createAuditLog({
    userId: userId ?? actor.id ?? null,
    username: username ?? actor.username ?? actor.displayName ?? null,
    role: role ?? actor.role ?? null,
    action,
    entityType,
    entityId: entityId == null ? null : String(entityId),
    details,
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });
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

    const userIds = [...new Set((data || [])
      .map((log) => log.user_id)
      .filter((id) => id !== null && id !== undefined))];

    let usersById = new Map();
    if (userIds.length) {
      const { data: users, error: usersError } = await supabase
        .from("user_accounts")
        .select("id, full_name, username")
        .in("id", userIds);

      if (usersError) {
        console.warn("Unable to enrich audit logs with account names:", usersError);
      } else {
        usersById = new Map((users || []).map((user) => [String(user.id), user]));
      }
    }

    const logs = (data || []).map((log) => {
      const account = log.user_id == null
        ? null
        : usersById.get(String(log.user_id));

      return {
        ...log,
        username: log.username || account?.username || null,
        full_name: account?.full_name || null,
      };
    });

    return res.json({ success: true, logs });
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
  createAuditLogFromRequest,
  getAuditLogs,
};