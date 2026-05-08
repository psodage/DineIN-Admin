const express = require("express");
const { authenticate, requireAdmin } = require("../middleware/authMiddleware");
const {
  runMongoBackupToDrive,
  runMongoRestoreFromDrive,
  runMongoRestoreLatestFromDrive,
  listRemoteBackupFiles,
  restoreConfirmPhrase,
} = require("../jobs/mongoBackupJob");

const router = express.Router();

router.post("/run", authenticate, requireAdmin, async (_req, res) => {
  try {
    await runMongoBackupToDrive();
    return res.status(200).json({ message: "Backup completed successfully" });
  } catch (error) {
    return res.status(500).json({ message: error?.message || "Backup failed" });
  }
});

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

router.get("/files", authenticate, requireAdmin, async (_req, res) => {
  try {
    const files = await listRemoteBackupFiles();
    return res.status(200).json({ files });
  } catch (error) {
    return res.status(500).json({ message: error?.message || "Failed to list backups" });
  }
});

router.post("/restore-latest", authenticate, requireAdmin, async (req, res) => {
  try {
    const { confirmPhrase } = req.body || {};
    if (!confirmPhrase) {
      return res.status(400).json({ message: "confirmPhrase is required" });
    }

    const restored = await runMongoRestoreLatestFromDrive({ confirmPhrase });
    return res.status(200).json({
      message: "Latest backup restored successfully",
      restoredFileName: restored.name,
      restoredFileSize: restored.size,
      restoredFileModTime: restored.modTime ? new Date(restored.modTime).toISOString() : null,
    });
  } catch (error) {
    const message = error?.message || "Restore latest failed";
    if (message.includes("confirmation phrase")) {
      return res.status(400).json({
        message: "Invalid confirmation phrase",
        expectedFormat: restoreConfirmPhrase,
      });
    }
    if (message.includes("No backup files")) {
      return res.status(404).json({ message });
    }
    return res.status(500).json({ message });
  }
});

module.exports = router;
