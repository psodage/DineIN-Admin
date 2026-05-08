const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const backupRoot = process.env.MONGO_BACKUP_LOCAL_DIR || path.join(__dirname, "..", "backups");
const restoreTmpRoot = process.env.MONGO_RESTORE_TMP_DIR || path.join(__dirname, "..", "restore-tmp");
const rcloneRemote = process.env.RCLONE_REMOTE;
const rcloneRemoteDir = process.env.RCLONE_REMOTE_DIR || "MongoBackups";
const localRetentionDays = Number(process.env.MONGO_BACKUP_LOCAL_RETENTION_DAYS || "14");
const remoteRetentionDays = Number(process.env.MONGO_BACKUP_REMOTE_RETENTION_DAYS || "30");
const autoEnabled = String(process.env.MONGO_BACKUP_AUTO_ENABLED || "false").toLowerCase() === "true";
const mongoDumpCommand = process.env.MONGODUMP_PATH || "mongodump";
const mongoRestoreCommand = process.env.MONGORESTORE_PATH || "mongorestore";
const rcloneCommand = process.env.RCLONE_PATH || "rclone";
const restoreConfirmPhrase = process.env.MONGO_RESTORE_CONFIRM_PHRASE || "RESTORE_NOW";

function getTimestamp() {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(
    now.getHours()
  )}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

function sanitizeName(name) {
  return String(name || "database").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function sanitizeArchiveFileName(name) {
  const base = path.basename(String(name || ""));
  if (!base.endsWith(".archive.gz")) {
    throw new Error("Invalid backup file name. Expected .archive.gz file");
  }
  if (base.includes("..") || base.includes("/") || base.includes("\\")) {
    throw new Error("Invalid backup file name");
  }
  return base;
}

function getDbNameFromUri(uri) {
  try {
    const parsed = new URL(uri);
    return parsed.pathname?.replace(/^\//, "")?.split("?")[0] || "database";
  } catch (_) {
    return "database";
  }
}

function runCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { shell: true, stdio: "inherit" });
    proc.on("error", (err) => {
      reject(new Error(`${label} failed to start: ${err.message}`));
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

function runCommandCapture(command, args, label) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    proc.on("error", (err) => {
      reject(new Error(`${label} failed to start: ${err.message}`));
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${label} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function cleanupLocalBackups(dirPath, keepDays) {
  if (!Number.isFinite(keepDays) || keepDays <= 0) return;
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const cutoffMs = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".gz")) continue;
    const fullPath = path.join(dirPath, entry.name);
    const stat = await fs.promises.stat(fullPath);
    if (stat.mtimeMs < cutoffMs) {
      await fs.promises.unlink(fullPath);
      console.log(`Deleted old local backup: ${entry.name}`);
    }
  }
}

async function runMongoBackupToDrive() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is missing in backend/.env");
  if (!rcloneRemote) throw new Error("RCLONE_REMOTE is missing in backend/.env");

  const dbName = sanitizeName(process.env.MONGO_BACKUP_DB_NAME || getDbNameFromUri(mongoUri));
  const timestamp = getTimestamp();
  const archiveFileName = `${dbName}_${timestamp}.archive.gz`;
  const archivePath = path.join(backupRoot, archiveFileName);
  const remoteBase = `${rcloneRemote}:${rcloneRemoteDir}/${dbName}`;
  const remoteFilePath = `${remoteBase}/${archiveFileName}`;

  await ensureDir(backupRoot);
  console.log(`[backup] Creating MongoDB archive at: ${archivePath}`);
  await runCommand(
    mongoDumpCommand,
    [`--uri="${mongoUri}"`, `--archive="${archivePath}"`, "--gzip"],
    "mongodump"
  );

  console.log(`[backup] Uploading archive to Google Drive: ${remoteFilePath}`);
  await runCommand(
    rcloneCommand,
    ["copyto", `"${archivePath}"`, `"${remoteFilePath}"`, "--progress"],
    "rclone copyto"
  );

  await cleanupLocalBackups(backupRoot, localRetentionDays);

  if (Number.isFinite(remoteRetentionDays) && remoteRetentionDays > 0) {
    console.log(`[backup] Removing remote backups older than ${remoteRetentionDays} days`);
    await runCommand(
      rcloneCommand,
      ["delete", `"${remoteBase}"`, "--min-age", `${remoteRetentionDays}d`],
      "rclone delete"
    );
  }

  console.log("[backup] MongoDB backup completed successfully");
}

async function runMongoRestoreFromDrive(options = {}) {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is missing in backend/.env");
  if (!rcloneRemote) throw new Error("RCLONE_REMOTE is missing in backend/.env");

  const dbName = sanitizeName(process.env.MONGO_BACKUP_DB_NAME || getDbNameFromUri(mongoUri));
  const fileName = sanitizeArchiveFileName(options.fileName);
  const confirmPhrase = String(options.confirmPhrase || "").trim();
  if (confirmPhrase !== restoreConfirmPhrase) {
    throw new Error("Restore confirmation phrase is invalid");
  }

  const remoteBase = `${rcloneRemote}:${rcloneRemoteDir}/${dbName}`;
  const remoteFilePath = `${remoteBase}/${fileName}`;
  const localArchivePath = path.join(restoreTmpRoot, fileName);

  await ensureDir(restoreTmpRoot);
  console.log(`[restore] Downloading backup from Google Drive: ${remoteFilePath}`);
  await runCommand(
    rcloneCommand,
    ["copyto", `"${remoteFilePath}"`, `"${localArchivePath}"`, "--progress"],
    "rclone copyto"
  );

  console.log(`[restore] Restoring MongoDB from archive: ${localArchivePath}`);
  await runCommand(
    mongoRestoreCommand,
    [`--uri="${mongoUri}"`, `--archive="${localArchivePath}"`, "--gzip", "--drop"],
    "mongorestore"
  );

  try {
    await fs.promises.unlink(localArchivePath);
  } catch (_) {}

  console.log("[restore] MongoDB restore completed successfully");
}

async function listRemoteBackupFiles() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is missing in backend/.env");
  if (!rcloneRemote) throw new Error("RCLONE_REMOTE is missing in backend/.env");
  const dbName = sanitizeName(process.env.MONGO_BACKUP_DB_NAME || getDbNameFromUri(mongoUri));
  const remoteBase = `${rcloneRemote}:${rcloneRemoteDir}/${dbName}`;
  const { stdout } = await runCommandCapture(
    rcloneCommand,
    ["lsjson", `"${remoteBase}"`],
    "rclone lsjson"
  );
  let parsed = [];
  try {
    parsed = JSON.parse(stdout || "[]");
  } catch (_) {
    throw new Error("Unable to parse backup list from Google Drive");
  }
  return (Array.isArray(parsed) ? parsed : [])
    .filter((item) => item && item.IsDir !== true && String(item.Name || "").endsWith(".archive.gz"))
    .map((item) => ({
      name: String(item.Name || ""),
      modTime: item.ModTime ? new Date(item.ModTime).getTime() : 0,
      size: Number(item.Size || 0),
    }))
    .sort((a, b) => b.modTime - a.modTime);
}

async function runMongoRestoreLatestFromDrive(options = {}) {
  const files = await listRemoteBackupFiles();
  if (!files.length) {
    throw new Error("No backup files found on Google Drive");
  }
  const latest = files[0];
  await runMongoRestoreFromDrive({
    fileName: latest.name,
    confirmPhrase: options.confirmPhrase,
  });
  return latest;
}

function msUntilNextMidnight(now = new Date()) {
  const next = new Date(now);
  next.setDate(now.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function startMongoBackupDailyScheduler() {
  if (!autoEnabled) {
    console.log("[backup] Daily backup scheduler disabled (MONGO_BACKUP_AUTO_ENABLED=false)");
    return;
  }

  const waitMs = msUntilNextMidnight();
  const midnightIn = Math.round(waitMs / 1000);
  console.log(`[backup] Daily backup scheduler active. First run in ${midnightIn}s at 12:00 AM.`);

  setTimeout(() => {
    runMongoBackupToDrive().catch((err) => {
      console.error("[backup] Scheduled backup failed:", err?.message || err);
    });

    setInterval(() => {
      runMongoBackupToDrive().catch((err) => {
        console.error("[backup] Scheduled backup failed:", err?.message || err);
      });
    }, 24 * 60 * 60 * 1000);
  }, waitMs);
}

module.exports = {
  runMongoBackupToDrive,
  runMongoRestoreFromDrive,
  runMongoRestoreLatestFromDrive,
  listRemoteBackupFiles,
  startMongoBackupDailyScheduler,
  restoreConfirmPhrase,
};
