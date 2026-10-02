import { randomUUID } from "node:crypto";
import { database, closeMongo } from "../src/infrastructure/mongo/connection";
import { hashPassword } from "../src/application/auth-service";
import type { AccountDoc } from "../src/infrastructure/mongo/documents";
async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    !/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(
      process.env.MONGODB_URI ?? "",
    )
  )
    throw new Error("Local database only.");
  const password = process.env.LOCAL_ADMIN_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("Set LOCAL_ADMIN_PASSWORD to at least 12 characters.");
  const db = await database();
  const email = "admin@astra.local";
  const existing = await db
    .collection<AccountDoc>("accounts")
    .findOne({ email });
  if (existing) {
    console.log("Local administrator already exists; password unchanged.");
    return;
  }
  await db
    .collection<AccountDoc>("accounts")
    .insertOne({
      _id: randomUUID(),
      email,
      name: "Local Administrator",
      role: "admin",
      status: "active",
      passwordHash: await hashPassword(password),
      createdAt: new Date(),
    });
  console.log("Created local administrator: admin@astra.local");
}
main()
  .finally(closeMongo)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
