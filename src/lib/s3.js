import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { customAlphabet } from "nanoid";
import { env } from "../config/env.js";

const id = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 16);

export const s3 = new S3Client({
  region: env.aws.region || "ap-south-1",
  credentials: {
    accessKeyId: env.aws.accessKeyId || "dummy-key",
    secretAccessKey: env.aws.secretAccessKey || "dummy-secret",
  },
});

export function buildKey(prefix, fileName) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return `${prefix}/${Date.now()}-${id()}-${safe}`;
}

export function getS3Url(key) {
  if (!key) return null;
  if (key.startsWith("http://") || key.startsWith("https://") || key.startsWith("data:")) {
    return key;
  }
  return `https://${env.aws.bucket}.s3.${env.aws.region}.amazonaws.com/${key}`;
}

/** Direct upload buffer to S3 */
export async function uploadToS3(buffer, key, contentType) {
  if (!env.aws.accessKeyId || !env.aws.secretAccessKey) {
    console.warn(`[s3] AWS credentials not configured, returning mock S3 key: ${key}`);
    return getS3Url(key);
  }

  const command = new PutObjectCommand({
    Bucket: env.aws.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3.send(command);
  console.log(`[s3] Successfully uploaded object to S3: ${key}`);
  return getS3Url(key);
}

/** Pre-signed PUT the browser uploads to directly. */
export async function signUpload(key, contentType) {
  if (!env.aws.accessKeyId || !env.aws.secretAccessKey) {
    return `/api/upload-mock?key=${encodeURIComponent(key)}`;
  }
  try {
    return await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: env.aws.bucket, Key: key, ContentType: contentType }),
      { expiresIn: env.aws.signedUrlTtl },
    );
  } catch (err) {
    console.error("[s3] Error generating signUpload URL:", err.message);
    return `/api/upload-mock?key=${encodeURIComponent(key)}`;
  }
}

export async function signDownload(key) {
  if (!key) return null;
  if (typeof key !== "string") return null;

  // Extract raw S3 object key if a full S3 endpoint URL was passed
  let s3Key = key;
  if (key.includes(".amazonaws.com/")) {
    s3Key = key.split(".amazonaws.com/")[1] || key;
  }

  if (s3Key.startsWith("data:")) {
    return s3Key;
  }

  if (!env.aws.accessKeyId || !env.aws.secretAccessKey) {
    return getS3Url(s3Key);
  }

  try {
    const signedUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.aws.bucket, Key: s3Key }), {
      expiresIn: env.aws.signedUrlTtl,
    });
    return signedUrl;
  } catch (err) {
    console.warn("[s3] signDownload fallback to public URL:", err.message);
    return getS3Url(s3Key);
  }
}

export async function deleteObject(key) {
  if (!env.aws.accessKeyId || !env.aws.secretAccessKey) return true;
  try {
    return await s3.send(new DeleteObjectCommand({ Bucket: env.aws.bucket, Key: key }));
  } catch (err) {
    console.error("[s3] Failed to delete S3 object:", err.message);
    return false;
  }
}

