import bcrypt from "bcryptjs";
import { connectDatabase } from "../config/db.js";
import { User } from "../models/User.js";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || "Studio Admin";

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before running this script.");
  process.exit(1);
}

await connectDatabase();

const passwordHash = await bcrypt.hash(password, 12);
const user = await User.findOneAndUpdate(
  { email: email.toLowerCase() },
  { name, email: email.toLowerCase(), passwordHash, role: "admin" },
  { new: true, upsert: true },
);

console.log(`[seed] admin ready: ${user.email}`);
process.exit(0);
