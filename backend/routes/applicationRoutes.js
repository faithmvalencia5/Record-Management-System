const express = require("express");
const router = express.Router();

const { authenticateToken } = require("../middleware/authMiddleware");

const {
  getApplications,
  getApplicationById,
  saveApplicationValidation,
  updateApplicationStatus,
  updateMembershipStatus,
  updateDocumentAuthentication,
  downloadIssuanceDocument,
} = require("../controllers/applicationController");

router.get("/", getApplications);

router.get("/:applicationId", getApplicationById);

router.post("/:applicationId/issuance-document", downloadIssuanceDocument);

router.put("/:applicationId/status", authenticateToken, updateApplicationStatus);

router.put("/:applicationId/membership-status", authenticateToken, updateMembershipStatus);

router.put(
  "/:applicationId/documents/:documentType/authentication", authenticateToken, updateDocumentAuthentication);

router.put("/:applicationId/validation", authenticateToken, saveApplicationValidation);

module.exports = router;
