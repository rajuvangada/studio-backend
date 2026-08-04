import { Router } from "express";
import { z } from "zod";
import { PortfolioItem } from "../models/Content.js";
import { asyncHandler } from "../middleware/error.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { buildKey, deleteObject, getS3Url, signDownload, signUpload, uploadToS3 } from "../lib/s3.js";
import { upload } from "../middleware/upload.js";

export const portfolioRouter = Router();

async function withUrl(item) {
  const url = (await signDownload(item.storageKey)) || getS3Url(item.storageKey);
  return { ...item.toObject(), imageUrl: url, image_url: url };
}

/** Public: published portfolio for the marketing site. */
portfolioRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await PortfolioItem.find({ published: true }).sort({ sortOrder: 1, createdAt: -1 });
    res.json({ items: await Promise.all(items.map(withUrl)) });
  }),
);

portfolioRouter.get(
  "/all",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const items = await PortfolioItem.find().sort({ sortOrder: 1, createdAt: -1 });
    res.json({ items: await Promise.all(items.map(withUrl)) });
  }),
);

portfolioRouter.post(
  "/sign",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ fileName: z.string().min(1), contentType: z.string().min(1) })
      .parse(req.body);
    const key = buildKey("portfolio", body.fileName);
    res.json({ key, uploadUrl: await signUpload(key, body.contentType) });
  }),
);

/** Direct multipart file upload to AWS S3 */
portfolioRouter.post(
  "/upload",
  requireAuth,
  requireAdmin,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided for upload." });
    }

    const fileName = req.file.originalname || "portfolio-image.jpg";
    const key = buildKey("portfolio", fileName);
    const publicUrl = await uploadToS3(req.file.buffer, key, req.file.mimetype);

    const title = req.body.title || fileName.replace(/\.[^/.]+$/, "");
    const category = req.body.category || "Editorial";
    const description = req.body.description || "";

    const item = await PortfolioItem.create({
      title,
      category,
      description,
      storageKey: key,
    });

    console.log(`[portfolio] Item created in MongoDB: ${item._id}`);
    res.status(201).json({ item: { ...item.toObject(), imageUrl: publicUrl, image_url: publicUrl } });
  }),
);

const itemBody = z.object({
  title: z.string().trim().min(2).max(160),
  category: z.string().trim().max(80).default("Editorial"),
  description: z.string().max(2000).optional().nullable(),
  storageKey: z.string().min(1),
  featured: z.boolean().optional(),
  showOnHome: z.boolean().optional(),
  published: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

portfolioRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = itemBody.parse(req.body);
    const item = await PortfolioItem.create(parsed);
    console.log(`[portfolio] Item created in MongoDB: ${item._id}`);
    res.status(201).json({ item: await withUrl(item) });
  }),
);

portfolioRouter.patch(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const item = await PortfolioItem.findByIdAndUpdate(req.params.id, itemBody.partial().parse(req.body), {
      new: true,
    });
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json({ item: await withUrl(item) });
  }),
);

portfolioRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const item = await PortfolioItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: "Item not found" });
    await deleteObject(item.storageKey).catch(() => {});
    res.json({ ok: true });
  }),
);

