import mongoose from "mongoose";
import { customAlphabet } from "nanoid";

const { Schema, model, models } = mongoose;

const code = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const token = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 32);

const ClientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    eventName: { type: String, trim: true },
    location: { type: String, trim: true },
    eventDate: Date,
    projectCode: { type: String, unique: true, default: () => `PRJ-${code()}${code()}` },
    galleryToken: { type: String, unique: true, index: true, default: () => token() },
    passcode: { type: String, default: () => code() },
    status: {
      type: String,
      enum: ["pending", "shooting", "editing", "delivered", "archived"],
      default: "pending",
    },
    galleryPublished: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    notes: String,
  },
  { timestamps: true },
);

export const Client = models.Client || model("Client", ClientSchema);

