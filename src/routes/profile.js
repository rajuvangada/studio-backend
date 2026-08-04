import { Router } from "express";
import { z } from "zod";
import { Service, StudioProfile } from "../models/Content.js";
import { asyncHandler } from "../middleware/error.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { buildKey, signDownload, signUpload, uploadToS3 } from "../lib/s3.js";
import { upload } from "../middleware/upload.js";


export const profileRouter = Router();

const DEFAULT_PROFILE = {
  id: "default-profile",
  studio_name: "GK Digital Studios",
  owner_name: "Govind Kumar Gella",
  logo_url: null,
  owner_photo_url: null,
  phone: "+91 98765 43210",
  whatsapp: "+91 98765 43210",
  email: "studio@gkdigitalstudios.com",
  instagram: "@gk_digital_studios",
  address: "Andhra Pradesh, India",
  business_hours: "Mon - Sat: 9:00 AM - 8:00 PM",
  tagline: "Cinematic photography for once-in-a-lifetime days.",
  about: "Award-winning wedding, portrait, and cinematic photography studio.",
};

async function serialize(profile) {
  if (!profile) return DEFAULT_PROFILE;
  const obj = profile.toObject ? profile.toObject() : profile;

  let ownerPhotoUrl = null;
  if (profile.ownerPhotoKey) {
    ownerPhotoUrl = await signDownload(profile.ownerPhotoKey);
  } else if (profile.ownerPhotoUrl) {
    ownerPhotoUrl = await signDownload(profile.ownerPhotoUrl);
  }

  let logoUrl = null;
  if (profile.logoKey) {
    logoUrl = await signDownload(profile.logoKey);
  } else if (profile.logoUrl) {
    logoUrl = await signDownload(profile.logoUrl);
  }

  return {
    ...obj,
    logoUrl,
    logo_url: logoUrl,
    ownerPhotoUrl,
    owner_photo_url: ownerPhotoUrl,
  };
}

/** Public: studio contact block used across the marketing site. */
profileRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    try {
      let profile = await StudioProfile.findOne({ singleton: true });
      if (!profile) profile = await StudioProfile.create({ singleton: true });
      return res.json({ profile: await serialize(profile) });
    } catch {
      return res.json({ profile: DEFAULT_PROFILE });
    }
  }),
);

profileRouter.put(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        studioName: z.string().trim().min(2).max(120),
        ownerName: z.string().trim().max(120).optional().nullable(),
        phone: z.string().trim().max(40).optional().nullable(),
        whatsapp: z.string().trim().max(40).optional().nullable(),
        email: z.string().trim().max(255).optional().nullable(),
        instagram: z.string().trim().max(160).optional().nullable(),
        address: z.string().trim().max(400).optional().nullable(),
        businessHours: z.string().max(400).optional().nullable(),
        tagline: z.string().max(300).optional().nullable(),
        about: z.string().max(4000).optional().nullable(),
        logoKey: z.string().max(400).optional().nullable(),
        ownerPhotoKey: z.string().max(400).optional().nullable(),
        ownerPhotoUrl: z.string().max(2000).optional().nullable(),
      })
      .partial()
      .parse(req.body);

    try {
      const profile = await StudioProfile.findOneAndUpdate({ singleton: true }, body, {
        new: true,
        upsert: true,
      });
      return res.json({ profile: await serialize(profile) });
    } catch {
      return res.json({ profile: { ...DEFAULT_PROFILE, ...body } });
    }
  }),
);

profileRouter.post(
  "/logo/sign",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z.object({ fileName: z.string(), contentType: z.string() }).parse(req.body);
    const key = buildKey("branding", body.fileName);
    res.json({ key, uploadUrl: await signUpload(key, body.contentType) });
  }),
);

profileRouter.post(
  "/logo/upload",
  requireAuth,
  requireAdmin,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided." });
    }

    const key = buildKey("branding", req.file.originalname);
    const logoUrl = await uploadToS3(req.file.buffer, key, req.file.mimetype);

    const profile = await StudioProfile.findOneAndUpdate(
      { singleton: true },
      { logoKey: key },
      { new: true, upsert: true },
    );

    console.log("[profile] Studio profile logo updated in MongoDB");
    res.json({ profile: { ...(await serialize(profile)), logoUrl } });
  }),
);

profileRouter.post(
  "/photo/sign",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z.object({ fileName: z.string(), contentType: z.string() }).parse(req.body);
    const key = buildKey("branding/owner", body.fileName);
    res.json({ key, uploadUrl: await signUpload(key, body.contentType) });
  }),
);

profileRouter.post(
  "/photo/upload",
  requireAuth,
  requireAdmin,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    console.log("[profile/photo/upload] Incoming POST upload request. Body keys:", Object.keys(req.body || {}));
    if (!req.file) {
      console.error("[profile/photo/upload] Error: req.file is undefined. Multer did not receive a file.");
      return res.status(400).json({ error: "No profile photo file provided or invalid form field name (must be 'file')." });
    }

    console.log(`[profile/photo/upload] File received by Multer: name=${req.file.originalname}, size=${req.file.size} bytes, type=${req.file.mimetype}`);

    const key = buildKey("branding/owner", req.file.originalname);
    console.log(`[profile/photo/upload] Uploading file to AWS S3 with key=${key}`);
    const ownerPhotoUrl = await uploadToS3(req.file.buffer, key, req.file.mimetype);
    console.log(`[profile/photo/upload] AWS S3 Upload Success! URL=${ownerPhotoUrl}`);

    const profile = await StudioProfile.findOneAndUpdate(
      { singleton: true },
      { ownerPhotoKey: key, ownerPhotoUrl },
      { new: true, upsert: true },
    );

    console.log("[profile/photo/upload] MongoDB StudioProfile document updated successfully.");
    const serialized = await serialize(profile);
    res.json({ profile: { ...serialized, ownerPhotoUrl } });
  }),
);


export const servicesRouter = Router();

const DEFAULT_SERVICES = [
  {
    title: "Wedding Photography & Films",
    description: "Full-day cinematic wedding coverage, bridal portraits, ceremony highlights, and hand-finished heirloom photo albums.",
    category: "Weddings",
    featured: true,
    published: true,
    sortOrder: 1,
  },
  {
    title: "Pre-Wedding & Couples Shoots",
    description: "Romantic outdoor and lifestyle couple sessions, styled concept shoots, and cinematic teaser films.",
    category: "Couples",
    featured: true,
    published: true,
    sortOrder: 2,
  },
  {
    title: "Editorial Portraits & Fashion",
    description: "High-fashion portraiture, creative editorial shoots, studio lighting concepts, and artist portfolios.",
    category: "Portraits",
    featured: false,
    published: true,
    sortOrder: 3,
  },
  {
    title: "Corporate & Event Coverage",
    description: "Professional corporate headshots, gala events, brand inaugurations, and commercial storytelling.",
    category: "Commercial",
    featured: false,
    published: true,
    sortOrder: 4,
  },
];

async function serializeService(service) {
  const obj = service.toObject ? service.toObject() : service;
  let coverImageUrl = obj.coverImageUrl || null;
  if (obj.coverImageKey) {
    coverImageUrl = await signDownload(obj.coverImageKey);
  } else if (coverImageUrl) {
    coverImageUrl = await signDownload(coverImageUrl);
  }
  return {
    ...obj,
    id: obj._id ? obj._id.toString() : obj.id,
    coverImageUrl,
    cover_image_url: coverImageUrl,
  };
}

servicesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    try {
      let count = await Service.countDocuments();
      if (count === 0) {
        console.log("[services] Seeding default services into MongoDB...");
        await Service.insertMany(DEFAULT_SERVICES);
      }
      const services = await Service.find({ published: true }).sort({ sortOrder: 1, createdAt: -1 });
      const serialized = await Promise.all(services.map(serializeService));
      return res.json({ services: serialized });
    } catch (err) {
      console.error("[services] Error fetching services:", err);
      return res.json({ services: [] });
    }
  }),
);

servicesRouter.get(
  "/admin",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const services = await Service.find().sort({ sortOrder: 1, createdAt: -1 });
    const serialized = await Promise.all(services.map(serializeService));
    res.json({ services: serialized });
  }),
);

const serviceBody = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(2000),
  category: z.string().trim().max(80).optional().nullable(),
  priceFrom: z.string().trim().max(80).optional().nullable(),
  coverImageKey: z.string().max(400).optional().nullable(),
  coverImageUrl: z.string().max(2000).optional().nullable(),
  sortOrder: z.number().int().optional(),
  featured: z.boolean().optional(),
  published: z.boolean().optional(),
});

servicesRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const created = await Service.create(serviceBody.parse(req.body));
    res.status(201).json({ service: await serializeService(created) });
  }),
);

servicesRouter.patch(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const service = await Service.findByIdAndUpdate(req.params.id, serviceBody.partial().parse(req.body), {
      new: true,
    });
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json({ service: await serializeService(service) });
  }),
);

servicesRouter.put(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const service = await Service.findByIdAndUpdate(req.params.id, serviceBody.partial().parse(req.body), {
      new: true,
    });
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json({ service: await serializeService(service) });
  }),
);

servicesRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await Service.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  }),
);

servicesRouter.post(
  "/cover/upload",
  requireAuth,
  requireAdmin,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided." });
    }
    const key = buildKey("services", req.file.originalname);
    const coverImageUrl = await uploadToS3(req.file.buffer, key, req.file.mimetype);

    let serviceId = req.body.serviceId;
    if (serviceId) {
      const updated = await Service.findByIdAndUpdate(
        serviceId,
        { coverImageKey: key, coverImageUrl },
        { new: true },
      );
      if (updated) {
        return res.json({ coverImageUrl, service: await serializeService(updated) });
      }
    }
    res.json({ coverImageKey: key, coverImageUrl });
  }),
);
