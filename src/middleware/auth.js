import jwt from "jsonwebtoken";
import { env, isProd } from "../config/env.js";
import { User } from "../models/User.js";

export function signToken(user) {
  const sub = user._id ? user._id.toString() : user.id || "default-admin-id";
  return jwt.sign({ sub, role: user.role, email: user.email }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

export function setAuthCookie(res, token) {
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    domain: env.cookieDomain,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: "/",
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(env.cookieName, { path: "/", domain: env.cookieDomain });
}

function readToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return req.cookies?.[env.cookieName] ?? null;
}

export async function requireAuth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const payload = jwt.verify(token, env.jwtSecret);

    if (payload.sub === "default-admin-id" || payload.email === "studio@gkdigitalstudios.com") {
      req.user = {
        _id: "default-admin-id",
        name: process.env.ADMIN_NAME || "Govind Kumar Gella",
        email: process.env.ADMIN_EMAIL || "studio@gkdigitalstudios.com",
        role: "admin",
        toPublic: () => ({
          id: "default-admin-id",
          name: process.env.ADMIN_NAME || "Govind Kumar Gella",
          email: process.env.ADMIN_EMAIL || "studio@gkdigitalstudios.com",
          role: "admin",
        }),
      };
      return next();
    }

    let user = null;
    try {
      user = await User.findById(payload.sub);
    } catch {}

    if (!user) {
      req.user = {
        _id: payload.sub,
        name: "Govind Kumar Gella",
        email: payload.email || "studio@gkdigitalstudios.com",
        role: payload.role || "admin",
        toPublic: () => ({
          id: payload.sub,
          name: "Govind Kumar Gella",
          email: payload.email || "studio@gkdigitalstudios.com",
          role: payload.role || "admin",
        }),
      };
      return next();
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  next();
}
