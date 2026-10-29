const express = require("express");
const router = express.Router();
const { generateStaffAnalyticsInsights } = require("../controllers/staffAnalyticsInsightsController");
router.post("/", generateStaffAnalyticsInsights);
module.exports = router;
