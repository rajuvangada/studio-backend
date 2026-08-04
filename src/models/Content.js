import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const PortfolioItemSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, default: "Editorial" },
    description: String,
    storageKey: { type: String, required: true },
    featured: { type: Boolean, default: false },
    showOnHome: { type: Boolean, default: false },
    published: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const PortfolioItem = models.PortfolioItem || model("PortfolioItem", PortfolioItemSchema);

const InquirySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: String,
    eventType: String,
    eventDate: Date,
    message: { type: String, required: true },
    status: { type: String, enum: ["new", "replied", "archived"], default: "new" },
    reply: String,
    repliedAt: Date,
  },
  { timestamps: true },
);

export const Inquiry = models.Inquiry || model("Inquiry", InquirySchema);

const ServiceSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: String,
    sortOrder: { type: Number, default: 0 },
    published: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Service = models.Service || model("Service", ServiceSchema);

const StudioProfileSchema = new Schema(
  {
    singleton: { type: Boolean, default: true, unique: true },
    studioName: { type: String, default: "GK Digital Studios" },
    ownerName: String,
    logoKey: String,
    phone: String,
    whatsapp: String,
    email: String,
    instagram: String,
    address: String,
    businessHours: String,
    tagline: String,
    about: String,
  },
  { timestamps: true },
);

export const StudioProfile = models.StudioProfile || model("StudioProfile", StudioProfileSchema);

