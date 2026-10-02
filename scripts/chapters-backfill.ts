import { randomUUID } from "node:crypto";
import { database, closeMongo } from "../src/infrastructure/mongo/connection";
import type { PublicationDoc } from "../src/infrastructure/mongo/documents";
import { validChapters } from "../src/domain/chapters";

// Gives every comic that has pages but no chapters a single "Chapter 1" covering all its pages.
// Dry run by default; pass --apply to write. Safe to re-run: comics with chapters are skipped.
async function main() {
  const apply = process.argv.includes("--apply");
  const db = await database();
  const publications = db.collection<PublicationDoc>("publications");
  const comics = await publications
    .find({
      kind: "comic",
      pageCount: { $gt: 0 },
      $or: [{ chapters: { $exists: false } }, { chapters: { $size: 0 } }],
    })
    .toArray();
  console.log(
    `${apply ? "Updating" : "Dry run:"} ${comics.length} comic(s) without chapters in ${db.databaseName}.`,
  );
  let updated = 0;
  for (const comic of comics) {
    const chapters = [{ id: randomUUID(), title: "Chapter 1", startPage: 1 }];
    if (!validChapters(chapters, comic.pageCount)) continue;
    const label = `"${comic.title}" (${comic.status}, ${comic.pageCount} pages)`;
    if (!apply) {
      console.log(`  would add Chapter 1 → ${label}`);
      continue;
    }
    // The version guard skips a comic an author saved while this ran; re-run to pick it up.
    const result = await publications.updateOne(
      {
        _id: comic._id,
        version: comic.version,
        $or: [{ chapters: { $exists: false } }, { chapters: { $size: 0 } }],
      },
      { $set: { chapters, updatedAt: new Date() }, $inc: { version: 1 } },
    );
    if (result.modifiedCount === 1) updated++;
    console.log(
      `  ${result.modifiedCount === 1 ? "added Chapter 1" : "skipped (changed meanwhile)"} → ${label}`,
    );
  }
  if (apply) console.log(`Done: ${updated} comic(s) updated.`);
  else if (comics.length) console.log("Re-run with --apply to write.");
}
main()
  .finally(closeMongo)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
