import { Router } from "express";
import { z } from "zod";
import { Client } from "../models/Client.js";
import { ActivityEvent, Media, Selection, Submission } from "../models/Media.js";
import { asyncHandler } from "../middleware/error.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { buildKey, deleteObject, getS3Url, signDownload, signUpload, uploadToS3 } from "../lib/s3.js";
import { upload } from "../middleware/upload.js";

export const clientsRouter = Router();
clientsRouter.use(requireAuth, requireAdmin);

const clientBody = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")).nullable(),
  eventName: z.string().trim().max(160).optional().nullable(),
  location: z.string().trim().max(160).optional().nullable(),
  eventDate: z.coerce.date().optional().nullable(),
  status: z.enum(["pending", "shooting", "editing", "delivered", "archived"]).optional(),
  galleryPublished: z.boolean().optional(),
  notes: z.string().max(4000).optional().nullable(),
});

clientsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q || "").toString().trim();
    const filter = q
      ? { $or: [{ name: new RegExp(q, "i") }, { eventName: new RegExp(q, "i") }, { projectCode: new RegExp(q, "i") }] }
      : {};
    res.json({ clients: await Client.find(filter).sort({ createdAt: -1 }).limit(200) });
  }),
);

clientsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const clientData = clientBody.parse(req.body);
    const client = await Client.create(clientData);
    console.log(`[clients] Client created in MongoDB: ${client._id} (${client.projectCode})`);
    await ActivityEvent.create({
      client: client._id,
      type: "client_created",
      description: `Project ${client.projectCode} created`,
    });
    res.status(201).json({ client });
  }),
);

clientsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: "Client not found" });

    const [media, selections, submissions, timeline] = await Promise.all([
      Media.find({ client: client._id }).sort({ sortOrder: 1, createdAt: 1 }),
      Selection.find({ client: client._id }),
      Submission.find({ client: client._id }).sort({ submittedAt: -1 }),
      ActivityEvent.find({ client: client._id }).sort({ createdAt: -1 }).limit(50),
    ]);

    const selectedIds = new Set(selections.map((s) => s.media.toString()));
    const withUrls = await Promise.all(
      media.map(async (m) => ({
        id: m._id,
        kind: m.kind,
        fileName: m.fileName,
        sizeBytes: m.sizeBytes,
        sortOrder: m.sortOrder,
        selected: selectedIds.has(m._id.toString()),
        url: (await signDownload(m.storageKey)) || getS3Url(m.storageKey),
      })),
    );

    res.json({ client, media: withUrls, submissions, timeline });
  }),
);

clientsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      clientBody.partial().parse(req.body),
      { new: true },
    );
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json({ client });
  }),
);

clientsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const media = await Media.find({ client: req.params.id });
    await Promise.all(media.map((m) => deleteObject(m.storageKey).catch(() => {})));
    await Promise.all([
      Media.deleteMany({ client: req.params.id }),
      Selection.deleteMany({ client: req.params.id }),
      Submission.deleteMany({ client: req.params.id }),
      ActivityEvent.deleteMany({ client: req.params.id }),
      Client.findByIdAndDelete(req.params.id),
    ]);
    res.json({ ok: true });
  }),
);

/** Step 1 of upload: browser asks for a pre-signed S3 PUT URL. */
clientsRouter.post(
  "/:id/media/sign",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        fileName: z.string().min(1).max(200),
        contentType: z.string().min(1).max(120),
        kind: z.enum(["photo", "video"]).default("photo"),
      })
      .parse(req.body);

    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: "Client not found" });

    const key = buildKey(`clients/${client._id}`, body.fileName);
    res.json({ key, uploadUrl: await signUpload(key, body.contentType) });
  }),
);

/** Step 2: browser confirms the S3 PUT succeeded and we record the object. */
clientsRouter.post(
  "/:id/media",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        key: z.string().min(1),
        fileName: z.string().min(1),
        contentType: z.string().optional(),
        sizeBytes: z.number().int().nonnegative().optional(),
        kind: z.enum(["photo", "video"]).default("photo"),
      })
      .parse(req.body);

    const count = await Media.countDocuments({ client: req.params.id });
    const media = await Media.create({
      client: req.params.id,
      storageKey: body.key,
      fileName: body.fileName,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      kind: body.kind,
      sortOrder: count,
    });
    await ActivityEvent.create({
      client: req.params.id,
      type: "media_uploaded",
      description: `${body.fileName} uploaded`,
    });
    const url = (await signDownload(media.storageKey)) || getS3Url(media.storageKey);
    console.log(`[clients] Media record created in MongoDB: ${media._id}`);
    res.status(201).json({ media: { ...media.toObject(), url } });
  }),
);

/** Direct Multer Upload to S3 */
clientsRouter.post(
  "/:id/media/upload",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No media file provided for upload." });
    }

    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: "Client not found" });

    const fileName = req.file.originalname;
    const kind = req.file.mimetype.startsWith("video/") ? "video" : "photo";
    const key = buildKey(`clients/${client._id}`, fileName);
    const publicUrl = await uploadToS3(req.file.buffer, key, req.file.mimetype);

    const count = await Media.countDocuments({ client: client._id });
    const media = await Media.create({
      client: client._id,
      storageKey: key,
      fileName,
      contentType: req.file.mimetype,
      sizeBytes: req.file.size,
      kind,
      sortOrder: count,
    });

    await ActivityEvent.create({
      client: client._id,
      type: "media_uploaded",
      description: `${fileName} uploaded`,
    });

    console.log(`[clients] Direct media uploaded & saved to MongoDB: ${media._id}`);
    res.status(201).json({ media: { ...media.toObject(), url: publicUrl } });
  }),
);


clientsRouter.delete(
  "/:id/media/:mediaId",
  asyncHandler(async (req, res) => {
    const media = await Media.findOneAndDelete({ _id: req.params.mediaId, client: req.params.id });
    if (!media) return res.status(404).json({ error: "Media not found" });
    await Selection.deleteMany({ media: media._id });
    await deleteObject(media.storageKey).catch(() => {});
    res.json({ ok: true });
  }),
);

/** Publish the gallery and hand back the shareable link + passcode. */
clientsRouter.post(
  "/:id/publish",
  asyncHandler(async (req, res) => {
    const { published } = z.object({ published: z.boolean() }).parse(req.body);
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { galleryPublished: published },
      { new: true },
    );
    if (!client) return res.status(404).json({ error: "Client not found" });
    await ActivityEvent.create({
      client: client._id,
      type: published ? "gallery_published" : "gallery_unpublished",
      description: published ? "Gallery published" : "Gallery unpublished",
    });
    res.json({
      client,
      galleryPath: `/gallery/${client.galleryToken}`,
      passcode: client.passcode,
    });
  }),
);

clientsRouter.post(
  "/:id/rotate-passcode",
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: "Client not found" });
    client.passcode = Math.random().toString(36).slice(2, 8).toUpperCase();
    await client.save();
    res.json({ passcode: client.passcode });
  }),
);

/** Admin review of what the client submitted. */
clientsRouter.get(
  "/:id/submissions/:submissionId",
  asyncHandler(async (req, res) => {
    const submission = await Submission.findOne({
      _id: req.params.submissionId,
      client: req.params.id,
    });
    if (!submission) return res.status(404).json({ error: "Submission not found" });

    const selections = await Selection.find({ client: req.params.id }).populate("media");
    const photos = await Promise.all(
      selections.map(async (s) => ({
        id: s.media._id,
        fileName: s.media.fileName,
        comment: s.comment,
        url: await signDownload(s.media.storageKey),
      })),
    );
    res.json({ submission, photos });
  }),
);

clientsRouter.post(
  "/:id/submissions/:submissionId/review",
  asyncHandler(async (req, res) => {
    const submission = await Submission.findOneAndUpdate(
      { _id: req.params.submissionId, client: req.params.id },
      { reviewedAt: new Date() },
      { new: true },
    );
    if (!submission) return res.status(404).json({ error: "Submission not found" });
    await ActivityEvent.create({
      client: req.params.id,
      type: "submission_reviewed",
      description: "Selection reviewed by studio",
    });
    res.json({ submission });
  }),
);
