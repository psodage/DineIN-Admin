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
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = new Set(collections.map((c) => c.name));

  if (names.has("students") && !names.has("members")) {
    // Rename primary collection.
    // Note: if you already created "members", do a manual merge instead.
    await db.collection("students").rename("members");
    console.log('Renamed collection "students" -> "members"');
  } else {
    console.log(
      `No rename needed (students exists: ${names.has("students")}, members exists: ${names.has("members")})`
    );
  }

  // Rename counter key if present: studentRollNumber -> memberRollNumber
  // (Counter documents are stored in "counters" collection by default)
  const countersColl = db.collection("counters");
  const studentCounter = await countersColl.findOne({ name: "studentRollNumber" });
  const memberCounter = await countersColl.findOne({ name: "memberRollNumber" });

  if (studentCounter && !memberCounter) {
    await countersColl.updateOne(
      { _id: studentCounter._id },
      { $set: { name: "memberRollNumber" } }
    );
    console.log('Renamed counter "studentRollNumber" -> "memberRollNumber"');
  } else if (studentCounter && memberCounter) {
    // Keep the larger seq, then remove the old key.
    const maxSeq = Math.max(
      Number(studentCounter.seq || 0),
      Number(memberCounter.seq || 0)
    );
    await countersColl.updateOne(
      { _id: memberCounter._id },
      { $set: { seq: maxSeq } }
    );
    await countersColl.deleteOne({ _id: studentCounter._id });
    console.log(
      'Merged counters into "memberRollNumber" and deleted "studentRollNumber"'
    );
  }

  await mongoose.disconnect();
}

main()
  .then(() => {
    console.log("Migration complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });

