import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { env, isProd } from "./config/env.js";
import { errorHandler, notFound, asyncHandler } from "./middleware/error.js";
import { requireAdmin, requireAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { clientsRouter } from "./routes/clients.js";
import { galleryRouter } from "./routes/gallery.js";
import { portfolioRouter } from "./routes/portfolio.js";
import { inquiriesRouter } from "./routes/inquiries.js";
import { profileRouter, servicesRouter } from "./routes/profile.js";
import { Client } from "./models/Client.js";
import { ActivityEvent, Submission } from "./models/Media.js";
import { Inquiry, PortfolioItem } from "./models/Content.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.raw({ type: "*/*", limit: "100mb" }));
  app.use(cookieParser());
  app.use(morgan(isProd ? "combined" : "dev"));

  app.get("/api/health", (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

  // Dev upload mock endpoint when S3 keys are not provided
  app.put("/api/upload-mock", (_req, res) => res.status(200).send("OK"));

  app.use("/api/auth", authRouter);
  app.use("/api/clients", clientsRouter);
  app.use("/api/galleries", clientsRouter);
  app.use("/api/gallery", galleryRouter);
  app.use("/api/portfolio", portfolioRouter);
  app.use("/api/inquiries", inquiriesRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/services", servicesRouter);

  app.get(
    "/api/dashboard",
    requireAuth,
    requireAdmin,
    asyncHandler(async (_req, res) => {
      try {
        const [clients, inquiries, portfolio, activity] = await Promise.all([
          Client.find().sort({ createdAt: -1 }),
          Inquiry.find().sort({ createdAt: -1 }),
          PortfolioItem.find().sort({ createdAt: -1 }),
          ActivityEvent.find().sort({ createdAt: -1 }).limit(12),
        ]);

        const [totalClients, activeProjects, deliveredProjects, newInquiries, pendingSubmissions] = await Promise.all([
          Client.countDocuments(),
          Client.countDocuments({ status: { $in: ["pending", "shooting", "editing"] } }),
          Client.countDocuments({ status: "delivered" }),
          Inquiry.countDocuments({ status: "new" }),
          Submission.countDocuments({ reviewedAt: null }),
        ]);

        res.json({
          stats: { totalClients, activeProjects, deliveredProjects, newInquiries, pendingSubmissions },
          clients: clients.map((c) => ({ ...c.toObject(), id: c._id.toString() })),
          inquiries: inquiries.map((i) => ({ ...i.toObject(), id: i._id.toString() })),
          portfolio: portfolio.map((p) => ({ ...p.toObject(), id: p._id.toString() })),
          activity: activity.map((a) => ({ ...a.toObject(), id: a._id.toString() })),
        });
      } catch {
        res.json({
          stats: { totalClients: 0, activeProjects: 0, deliveredProjects: 0, newInquiries: 0, pendingSubmissions: 0 },
          clients: [],
          inquiries: [],
          portfolio: [],
          activity: [],
        });
      }
    }),
  );

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
