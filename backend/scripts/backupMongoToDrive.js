const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { runMongoBackupToDrive } = require("../jobs/mongoBackupJob");

runMongoBackupToDrive().catch((err) => {
  console.error("MongoDB backup failed:", err.message || err);
  process.exit(1);
});
