const express = require("express");
const router = express.Router();

const {
  getApplications,
  getApplicationById,
  saveApplicationValidation,
  updateApplicationStatus,
  updateDocumentAuthentication,
} = require("../controllers/applicationController");

// Get all applications
router.get("/", getApplications);

// Get one application
router.get("/:applicationId", getApplicationById);

// Update application status
router.put("/:applicationId/status", updateApplicationStatus);

// Update document authentication
router.put(
  "/:applicationId/documents/:documentType/authentication", updateDocumentAuthentication);

// Save validation result
router.put("/:applicationId/validation", saveApplicationValidation);

module.exports = router;
