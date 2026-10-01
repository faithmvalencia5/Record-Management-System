const express = require("express");
const router = express.Router();

const {
  getApplications,
  getApplicationById,
  saveApplicationValidation,
  updateApplicationStatus,
} = require("../controllers/applicationController");

// Get all applications
router.get("/", getApplications);

// Get one application
router.get("/:applicationId", getApplicationById);

// Update application status
router.put("/:applicationId/status", updateApplicationStatus);

// Save validation result
router.put("/:applicationId/validation", saveApplicationValidation);

module.exports = router;
