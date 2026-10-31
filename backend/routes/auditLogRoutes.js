const express = require("express");

const {
  getAuditLogs,
  recordExportAudit,
} = require("../controllers/auditLogController");

const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
  "/",
  authenticateToken,
  requireAdmin,
  getAuditLogs
);

router.post(
  "/exports",
  authenticateToken,
  requireAdmin,
  recordExportAudit
);

module.exports = router;