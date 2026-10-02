import { database, closeMongo } from "../src/infrastructure/mongo/connection";
import type {
  AccountDoc,
  PublicationDoc,
} from "../src/infrastructure/mongo/documents";

// Marks publications created by administrator accounts as Originals. New ones are marked
// automatically; this only covers works uploaded before Originals existed.
// Dry run by default; pass --apply to write. Safe to re-run.
async function main() {
  const apply = process.argv.includes("--apply");
  const db = await database();
  const admins = await db
    .collection<AccountDoc>("accounts")
    .find({ role: "admin" }, { projection: { _id: 1 } })
    .toArray();
  const publications = db.collection<PublicationDoc>("publications");
  const filter = {
    authorId: { $in: admins.map((admin) => admin._id) },
    original: { $ne: true },
  };
  const pending = await publications
    .find(filter, { projection: { title: 1, status: 1, kind: 1 } })
    .toArray();
  console.log(
    `${apply ? "Updating" : "Dry run:"} ${pending.length} administrator publication(s) not yet marked as Originals in ${db.databaseName}.`,
  );
  for (const item of pending)
    console.log(
      `  ${apply ? "marking" : "would mark"} "${item.title}" (${item.kind}, ${item.status})`,
    );
  if (!apply) {
    if (pending.length) console.log("Re-run with --apply to write.");
    return;
  }
  const result = await publications.updateMany(filter, {
    $set: { original: true, updatedAt: new Date() },
    $inc: { version: 1 },
  });
  console.log(
    `Done: ${result.modifiedCount} publication(s) marked as Originals.`,
  );
}
main()
  .finally(closeMongo)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
