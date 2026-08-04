import { createApp } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";

async function main() {
  // Enforce DB connection BEFORE Express app starts listening
  await connectDatabase();

  const awsConfigured = Boolean(env.aws.accessKeyId && env.aws.secretAccessKey && env.aws.bucket);
  console.log(`AWS Status:    ${awsConfigured ? `Configured (Bucket: ${env.aws.bucket}, Region: ${env.aws.region})` : "Disabled (Missing credentials)"}`);

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Server Running: http://localhost:${env.port}`);
    console.log("==================================================");
  });
}

main().catch((err) => {
  console.error("[api] Failed to start backend server:", err);
  process.exit(1);
});

