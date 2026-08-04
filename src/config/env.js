import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

const isProd = process.env.NODE_ENV === "production";

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if ((value === undefined || value === "") && isProd) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? fallback;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  clientOrigin: (process.env.CLIENT_ORIGIN || "http://localhost:8080,http://localhost:3000,http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  mongoUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/gkdigital"),
  jwtSecret: required("JWT_SECRET", "gk-digital-studios-dev-jwt-secret-key-change-in-prod-2026"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  cookieName: process.env.COOKIE_NAME || "gk_token",
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  aws: {
    region: required("AWS_REGION", "ap-south-1"),
    accessKeyId: required("AWS_ACCESS_KEY_ID", ""),
    secretAccessKey: required("AWS_SECRET_ACCESS_KEY", ""),
    bucket: required("S3_BUCKET", "gk-studio"),
    signedUrlTtl: Number(process.env.S3_SIGNED_URL_TTL || 900),
  },
  envPath,
};

export { isProd };
