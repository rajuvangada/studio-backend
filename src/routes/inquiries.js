import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { Inquiry } from "../models/Content.js";
import { asyncHandler } from "../middleware/error.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

export const inquiriesRouter = Router();

const publicLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });

/** Public: contact form submissions. */
inquiriesRouter.post(
  "/",
  publicLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(255),
        phone: z.string().trim().max(30).optional().or(z.literal("")).nullable(),
        eventType: z.string().trim().max(80).optional().or(z.literal("")).nullable(),
        eventDate: z.coerce.date().optional().nullable(),
        message: z.string().trim().min(5).max(2000),
      })
      .parse(req.body);

    const inquiry = await Inquiry.create(body);
    console.log(`[inquiry] Contact form inquiry saved to MongoDB: ${inquiry._id} from ${inquiry.email}`);
    res.status(201).json({ ok: true, inquiry });
  }),
);


inquiriesRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = req.query.status?.toString();
    const filter = status && status !== "all" ? { status } : {};
    res.json({ inquiries: await Inquiry.find(filter).sort({ createdAt: -1 }).limit(300) });
  }),
);

inquiriesRouter.patch(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        status: z.enum(["new", "replied", "archived"]).optional(),
        reply: z.string().max(4000).optional(),
      })
      .parse(req.body);
    const patch = { ...body };
    if (body.reply) {
      patch.repliedAt = new Date();
      patch.status = body.status ?? "replied";
    }
    const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, patch, { new: true });
    if (!inquiry) return res.status(404).json({ error: "Inquiry not found" });
    res.json({ inquiry });
  }),
);

inquiriesRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await Inquiry.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  }),
);
