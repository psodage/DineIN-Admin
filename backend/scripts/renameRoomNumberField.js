const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  await mongoose.connect(uri);

  const db = mongoose.connection.db;

  // Rename field roomNumber -> roomOwnerName on members collection
  const result = await db.collection("members").updateMany(
    { roomNumber: { $exists: true } },
    { $rename: { roomNumber: "roomOwnerName" } }
  );

  console.log(
    `Renamed roomNumber -> roomOwnerName on ${result.modifiedCount} member documents`
  );

  await mongoose.disconnect();
}

main()
  .then(() => {
    console.log("Field rename migration complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Field rename migration failed:", err);
    process.exit(1);
  });

