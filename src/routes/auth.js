import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { User } from "../models/User.js";
import { asyncHandler } from "../middleware/error.js";
import { clearAuthCookie, requireAuth, setAuthCookie, signToken } from "../middleware/auth.js";
import { env } from "../config/env.js";

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true });

const credentials = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(200),
});

authRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = credentials.parse(req.body);
    const normalizedEmail = email.toLowerCase();

    const adminEmail = (process.env.ADMIN_EMAIL || "studio@gkdigitalstudios.com").toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || "adminpassword123";

    let user = null;
    try {
      user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");
    } catch {
      // Ignore DB error in dev
    }

    if (user) {
      if (!(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      user.lastLoginAt = new Date();
      await user.save().catch(() => {});
      const token = signToken(user);
      setAuthCookie(res, token);
      return res.json({ user: user.toPublic(), token });
    }

    // Fallback in dev if admin account not yet seeded in MongoDB
    if (normalizedEmail === adminEmail && password === adminPassword) {
      const devAdmin = {
        _id: "default-admin-id",
        name: process.env.ADMIN_NAME || "Govind Kumar Gella",
        email: adminEmail,
        role: "admin",
        toPublic: () => ({
          id: "default-admin-id",
          name: process.env.ADMIN_NAME || "Govind Kumar Gella",
          email: adminEmail,
          role: "admin",
        }),
      };
      const token = signToken(devAdmin);
      setAuthCookie(res, token);
      return res.json({ user: devAdmin.toPublic(), token });
    }

    return res.status(401).json({ error: "Invalid email or password" });
  }),
);

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user.toPublic ? req.user.toPublic() : req.user });
  }),
);

authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ currentPassword: z.string(), newPassword: z.string().min(6).max(200) })
      .parse(req.body);

    let user = null;
    try {
      user = await User.findById(req.user._id).select("+passwordHash");
    } catch {}

    if (user) {
      if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
      user.passwordHash = await bcrypt.hash(body.newPassword, 12);
      await user.save();
    }
    res.json({ ok: true });
  }),
);
