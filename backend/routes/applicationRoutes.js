const express = require("express");
const router = express.Router();

const {
  getApplications,
  getApplicationById,
  saveApplicationValidation,
  updateApplicationStatus,
  updateDocumentAuthentication,
  downloadIssuanceDocument,
} = require("../controllers/applicationController");

router.get("/", getApplications);

router.get("/:applicationId", getApplicationById);

router.post("/:applicationId/issuance-document", downloadIssuanceDocument);

router.put("/:applicationId/status", updateApplicationStatus);

router.put(
  "/:applicationId/documents/:documentType/authentication", updateDocumentAuthentication);

router.put("/:applicationId/validation", saveApplicationValidation);

module.exports = router;
