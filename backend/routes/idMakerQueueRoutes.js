const express = require("express");

const router = express.Router();

const {
  addToIdMakerQueue,
  getIdMakerQueue,
  updateIdMakerQueue,
} = require("../controllers/idMakerQueueController");


// GET ID MAKER QUEUE
router.get("/", getIdMakerQueue);


// ADD APPLICANT TO ID MAKER QUEUE
router.post("/", addToIdMakerQueue);


// UPDATE ID MAKER QUEUE
router.put("/:applicationId", updateIdMakerQueue);


module.exports = router;