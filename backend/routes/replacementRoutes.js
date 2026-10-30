
const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/authMiddleware");

const {
  getReplacementRequests,
  getReplacementRequestById,
  decideReplacementRequest,
} = require("../controllers/replacementController");

router.get("/", getReplacementRequests);
router.get("/:id", getReplacementRequestById);
router.put("/:id/decision", authenticateToken, decideReplacementRequest);

module.exports = router;
