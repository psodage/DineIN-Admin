const mongoose = require("mongoose");

const pollOptionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // stable identifier (e.g. "veg")
    label: { type: String, required: true }, // English display
    labelMr: { type: String, default: "" }, // Marathi display
  },
  { _id: false }
);

const pollVoteSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
    optionKey: { type: String, required: true },
    votedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const pollSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true }, // stored as start-of-day UTC (same as Menu)
    question: { type: String, default: "Meal Preference" },
    questionMr: { type: String, default: "" },
    options: { type: [pollOptionSchema], required: true },
    votes: { type: [pollVoteSchema], default: [] },
    expiresAt: { type: Date, required: true }, // TTL delete when day is over
  },
  { timestamps: true }
);

pollSchema.index({ date: 1 }, { unique: true });
pollSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Poll", pollSchema);

