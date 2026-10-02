import { MongoClient } from "mongodb";
import { createHmac } from "node:crypto";

export default async function setup() {
  const origin = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3100");
  const uri = process.env.MONGODB_URI ?? "";
  if (
    !["localhost", "127.0.0.1"].includes(origin.hostname) ||
    !uri.startsWith("mongodb://127.0.0.1:27028/") ||
    process.env.STORAGE_DRIVER !== "local" ||
    process.env.NODE_ENV === "production"
  ) {
    throw new Error("Browser fixtures require the local development services.");
  }
  // Repeated tests share the loopback identity. Reset its auth bucket only;
  // the application limiter and concurrent rate-limit integration tests stay enabled.
  const identity = createHmac("sha256", process.env.RATE_LIMIT_SECRET!)
    .update("local")
    .digest("hex");
  const client = new MongoClient(uri);
  try {
    await client
      .db(process.env.MONGODB_DATABASE)
      .collection<{ _id: string }>("rateLimits")
      .deleteMany({
        _id: { $regex: `^(reader|studio|admin):auth:10:600:${identity}:` },
      });
  } finally {
    await client.close();
  }
}
