const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { runMongoRestoreFromDrive } = require("../jobs/mongoBackupJob");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "";
    args[key] = value;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fileName = args.file;
  const confirmPhrase = args.confirm;
  if (!fileName || !confirmPhrase) {
    throw new Error(
      "Usage: node scripts/restoreMongoFromDrive.js --file <backup_file.archive.gz> --confirm <phrase>"
    );
  }

  await runMongoRestoreFromDrive({ fileName, confirmPhrase });
}

main().catch((err) => {
  if (String(err?.message || "").includes("mongorestore")) {
    console.error(
      "Hint: Install MongoDB Database Tools or set MONGORESTORE_PATH in backend/.env (Windows example: C:\\Program Files\\MongoDB\\Tools\\100\\bin\\mongorestore.exe)"
    );
  }
  console.error("MongoDB restore failed:", err.message || err);
  process.exit(1);
});
