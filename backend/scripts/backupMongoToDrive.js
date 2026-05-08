const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { runMongoBackupToDrive } = require("../jobs/mongoBackupJob");

runMongoBackupToDrive().catch((err) => {
  if (String(err?.message || "").includes("mongodump exited with code")) {
    console.error(
      "Hint: Install MongoDB Database Tools or set MONGODUMP_PATH in backend/.env (Windows example: C:\\Program Files\\MongoDB\\Tools\\100\\bin\\mongodump.exe)"
    );
  }
  console.error("MongoDB backup failed:", err.message || err);
  process.exit(1);
});
