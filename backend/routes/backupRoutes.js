const express = require("express");
const { authenticate, requireAdmin } = require("../middleware/authMiddleware");
const { runMongoRestoreFromDrive, restoreConfirmPhrase } = require("../jobs/mongoBackupJob");

const router = express.Router();

router.post("/restore", authenticate, requireAdmin, async (req, res) => {
  try {
    const { fileName, confirmPhrase } = req.body || {};
    if (!fileName || !confirmPhrase) {
      return res.status(400).json({
        message: "fileName and confirmPhrase are required",
      });
    }

    await runMongoRestoreFromDrive({ fileName, confirmPhrase });
    return res.status(200).json({
      message: "Restore completed successfully",
      fileName,
    });
  } catch (error) {
    const message = error?.message || "Restore failed";
    if (message.includes("confirmation phrase")) {
      return res.status(400).json({
        message: "Invalid confirmation phrase",
        expectedFormat: restoreConfirmPhrase,
      });
    }
    return res.status(500).json({ message });
  }
});

module.exports = router;
