import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const MediaSchema = new Schema(
  {
    client: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    kind: { type: String, enum: ["photo", "video"], default: "photo" },
    storageKey: { type: String, required: true },
    fileName: { type: String, required: true },
    contentType: String,
    sizeBytes: Number,
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Media = models.Media || model("Media", MediaSchema);

const SelectionSchema = new Schema(
  {
    client: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    media: { type: Schema.Types.ObjectId, ref: "Media", required: true },
    comment: String,
  },
  { timestamps: true },
);
SelectionSchema.index({ client: 1, media: 1 }, { unique: true });

export const Selection = models.Selection || model("Selection", SelectionSchema);

const SubmissionSchema = new Schema(
  {
    client: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    notes: String,
    photoCount: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
  },
  { timestamps: true },
);

export const Submission = models.Submission || model("Submission", SubmissionSchema);

const ActivityEventSchema = new Schema(
  {
    client: { type: Schema.Types.ObjectId, ref: "Client", index: true },
    type: { type: String, required: true },
    description: String,
  },
  { timestamps: true },
);

export const ActivityEvent = models.ActivityEvent || model("ActivityEvent", ActivityEventSchema);

