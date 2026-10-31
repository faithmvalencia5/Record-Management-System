const express = require("express");
const router = express.Router();

const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");
const {
  createSystemBackup,
  listSystemBackups,
  restoreSystemBackup,
} = require("../controllers/backupController");

router.use(authenticateToken, requireAdmin);
router.get("/", listSystemBackups);
router.post("/", createSystemBackup);
router.post("/:backupId/restore", restoreSystemBackup);

module.exports = router;
