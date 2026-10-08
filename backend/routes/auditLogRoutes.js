const express = require("express");

const {
  getAuditLogs,
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

module.exports = router;