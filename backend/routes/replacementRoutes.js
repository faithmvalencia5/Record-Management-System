
const express = require("express");
const router = express.Router();

const {
  getReplacementRequests,
  getReplacementRequestById,
  decideReplacementRequest,
} = require("../controllers/replacementController");

router.get("/", getReplacementRequests);
router.get("/:id", getReplacementRequestById);
router.put("/:id/decision", decideReplacementRequest);

module.exports = router;
