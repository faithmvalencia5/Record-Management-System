const express = require("express");

const router = express.Router();

const {
  addToIdMakerQueue,
  getIdMakerQueue,
  updateIdMakerQueue,
} = require("../controllers/idMakerQueueController");
const {
  generateIdMakerAnalyticsInsights,
} = require("../controllers/idMakerAnalyticsController");


// GET ID MAKER QUEUE
router.get("/", getIdMakerQueue);

// Generate validated descriptive text from aggregate statistics only.
router.post("/analytics-insights", generateIdMakerAnalyticsInsights);


// ADD APPLICANT TO ID MAKER QUEUE
router.post("/", addToIdMakerQueue);


// UPDATE ID MAKER QUEUE
router.put("/:applicationId", updateIdMakerQueue);


module.exports = router;
