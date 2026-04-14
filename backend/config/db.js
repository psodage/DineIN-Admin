const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB Connected");

    // One-time migration: rename "students" collection to "members"
    // and "studentRollNumber" counter to "memberRollNumber".
    // This keeps the app working after the Student -> Member rename.
    try {
      const db = mongoose.connection.db;
      const collections = await db
        .listCollections({}, { nameOnly: true })
        .toArray();
      const names = new Set(collections.map((c) => c.name));

      if (names.has("students") && !names.has("members")) {
        await db.collection("students").rename("members");
        console.log('Migration: renamed collection "students" -> "members"');
      }

      // Counter migration (if Counter model was used previously)
      if (names.has("counters")) {
        const countersColl = db.collection("counters");
        const studentCounter = await countersColl.findOne({
          name: "studentRollNumber",
        });
        const memberCounter = await countersColl.findOne({
          name: "memberRollNumber",
        });

        if (studentCounter && !memberCounter) {
          await countersColl.updateOne(
            { _id: studentCounter._id },
            { $set: { name: "memberRollNumber" } }
          );
          console.log(
            'Migration: renamed counter "studentRollNumber" -> "memberRollNumber"'
          );
        } else if (studentCounter && memberCounter) {
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
            'Migration: merged counters into "memberRollNumber" and removed "studentRollNumber"'
          );
        }
      }
    } catch (migrationError) {
      console.warn("Migration skipped/failed:", migrationError?.message || migrationError);
    }
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;