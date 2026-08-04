import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  
  try {
    const conn = await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
    });

    const host = conn.connection.host || "unknown-host";
    const port = conn.connection.port || 27017;
    const name = conn.connection.name || "gkdigital";

    console.log("==================================================");
    console.log("MongoDB Connected");
    console.log(`Database Name: ${name}`);
    console.log(`Host:          ${host}`);
    console.log(`Port:          ${port}`);
    console.log(`Environment:   ${env.nodeEnv}`);
    console.log("==================================================");

    return conn.connection;
  } catch (err) {
    console.error("[db] FATAL: MongoDB connection failed!");
    console.error(`[db] Connection URI: ${env.mongoUri.replace(/:([^@]+)@/, ":****@")}`);
    console.error(`[db] Error details: ${err.message}`);
    throw err;
  }
}

