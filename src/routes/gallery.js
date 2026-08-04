import { Router } from "express";
import { z } from "zod";
import { Client } from "../models/Client.js";
import { ActivityEvent, Media, Selection, Submission } from "../models/Media.js";
import { asyncHandler } from "../middleware/error.js";
import { signDownload, getS3Url } from "../lib/s3.js";
import rateLimit from "express-rate-limit";

export const galleryRouter = Router();

const unlockLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });

/** Helper to find and validate gallery client by token */
async function getGalleryClient(token) {
  const client = await Client.findOne({ galleryToken: token, isActive: true });
  if (!client) {
    const err = new Error("Gallery not found.");
    err.status = 404;
    throw err;
  }
  if (!client.galleryPublished) {
    const err = new Error("Gallery is not available.");
    err.status = 403;
    throw err;
  }
  return client;
}

async function authorize(token, passcode) {
  const client = await getGalleryClient(token);
  if (!passcode || passcode.trim().toUpperCase() !== client.passcode.toUpperCase()) {
    const err = new Error("Incorrect passcode.");
    err.status = 401;
    throw err;
  }
  return client;
}

/** Check gallery token info and publication status before passcode entry */
galleryRouter.get(
  "/:token/info",
  asyncHandler(async (req, res) => {
    const client = await getGalleryClient(req.params.token);
    res.json({
      ok: true,
      name: client.name,
      eventName: client.eventName,
      eventDate: client.eventDate,
      location: client.location,
      galleryPublished: client.galleryPublished,
    });
  }),
);

/** Client login to their private gallery — passcode only, no account needed. */
galleryRouter.post(
  "/:token/open",
  unlockLimiter,
  asyncHandler(async (req, res) => {
    const { passcode } = z.object({ passcode: z.string().max(40) }).parse(req.body);
    const client = await authorize(req.params.token, passcode);

    const [media, selections, latest] = await Promise.all([
      Media.find({ client: client._id }).sort({ sortOrder: 1, createdAt: 1 }),
      Selection.find({ client: client._id }),
      Submission.findOne({ client: client._id }).sort({ submittedAt: -1 }),
    ]);
    const selectedIds = new Set(selections.map((s) => s.media.toString()));

    res.json({
      client: {
        name: client.name,
        eventName: client.eventName,
        eventDate: client.eventDate,
        location: client.location,
      },
      photos: await Promise.all(
        media.map(async (m) => ({
          id: m._id,
          kind: m.kind,
          fileName: m.fileName,
          selected: selectedIds.has(m._id.toString()),
          url: (await signDownload(m.storageKey)) || getS3Url(m.storageKey),
        })),
      ),
      submittedAt: latest?.submittedAt ?? null,
    });
  }),
);

galleryRouter.post(
  "/:token/select",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        passcode: z.string(),
        mediaId: z.string(),
        selected: z.boolean(),
        comment: z.string().max(1000).optional(),
      })
      .parse(req.body);
    const client = await authorize(req.params.token, body.passcode);

    const media = await Media.findOne({ _id: body.mediaId, client: client._id });
    if (!media) return res.status(404).json({ error: "Photo not found" });

    if (body.selected) {
      await Selection.updateOne(
        { client: client._id, media: media._id },
        { $set: { comment: body.comment ?? null } },
        { upsert: true },
      );
    } else {
      await Selection.deleteOne({ client: client._id, media: media._id });
    }
    res.json({ ok: true });
  }),
);

galleryRouter.post(
  "/:token/comment",
  asyncHandler(async (req, res) => {
    const body = z
      .object({ passcode: z.string(), mediaId: z.string(), comment: z.string().max(1000) })
      .parse(req.body);
    const client = await authorize(req.params.token, body.passcode);
    await Selection.updateOne(
      { client: client._id, media: body.mediaId },
      { $set: { comment: body.comment } },
      { upsert: true },
    );
    res.json({ ok: true });
  }),
);

galleryRouter.post(
  "/:token/submit",
  asyncHandler(async (req, res) => {
    const body = z.object({ passcode: z.string(), notes: z.string().max(2000).optional() }).parse(req.body);
    const client = await authorize(req.params.token, body.passcode);

    const count = await Selection.countDocuments({ client: client._id });
    if (count === 0) return res.status(400).json({ error: "Select at least one photo." });

    const submission = await Submission.create({
      client: client._id,
      notes: body.notes,
      photoCount: count,
    });
    await ActivityEvent.create({
      client: client._id,
      type: "selection_submitted",
      description: `${count} photos submitted by the client`,
    });
    res.status(201).json({ submission, count });
  }),
);
