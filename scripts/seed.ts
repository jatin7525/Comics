import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { config } from "../src/server/config";
import { database, closeMongo } from "../src/infrastructure/mongo/connection";
import { ensureIndexes } from "../src/infrastructure/mongo/indexes";
import {
  toDocument,
  type AccountDoc,
  type GrantDoc,
  type PageDoc,
  type PublicationDoc,
} from "../src/infrastructure/mongo/documents";
import { hashPassword } from "../src/application/auth-service";
import { createStorage } from "../src/infrastructure/storage/factory";
import type {
  AccessModel,
  Genre,
  Publication,
  Role,
} from "../src/domain/models";

async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    config().STORAGE_DRIVER !== "local" ||
    !/^(mongodb:\/\/)(127\.0\.0\.1|localhost):/.test(config().MONGODB_URI)
  )
    throw new Error(
      "Seed is restricted to the local development database and simulator.",
    );
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error(
      "Set SEED_PASSWORD (at least 12 characters) in .env.local.",
    );
  await ensureIndexes();
  const db = await database();
  const people: { key: string; name: string; role: Role }[] = [
    { key: "admin", name: "Astra Editorial", role: "admin" },
    { key: "author", name: "Kai Nakamura", role: "author" },
    { key: "author2", name: "Amara Okafor", role: "author" },
    { key: "reader", name: "Alex Reader", role: "reader" },
    { key: "member", name: "Mira Member", role: "reader" },
  ];
  const ids = new Map<string, string>();
  for (const person of people) {
    const email = `${person.key}@astra.test`;
    const existing = await db
      .collection<AccountDoc>("accounts")
      .findOne({ email });
    const id = existing?._id ?? randomUUID();
    ids.set(person.key, id);
    if (!existing)
      await db
        .collection<AccountDoc>("accounts")
        .insertOne({
          _id: id,
          name: person.name,
          role: person.role,
          email,
          passwordHash: await hashPassword(password),
          status: "active",
          createdAt: new Date(),
        });
  }
  const titles: {
    title: string;
    slug: string;
    art: string;
    author: string;
    genre: Genre;
    access: AccessModel;
    synopsis: string;
  }[] = [
    {
      title: "Neon Afterlight",
      slug: "neon-afterlight",
      art: "neon",
      author: "author",
      genre: "Sci-fi",
      access: "membership",
      synopsis:
        "In a city that never sees the sun, one courier carries its last light. A journey through the places we leave behind.",
    },
    {
      title: "The Dune Walker",
      slug: "the-dune-walker",
      art: "sand",
      author: "author2",
      genre: "Fantasy",
      access: "purchase",
      synopsis:
        "Beyond the salt kingdoms, a forgotten god is waking. Follow Amara through a desert that remembers every footstep.",
    },
    {
      title: "Where the Wild Sleeps",
      slug: "where-the-wild-sleeps",
      art: "forest",
      author: "author",
      genre: "Adventure",
      access: "free",
      synopsis:
        "A map. A missing brother. A forest that remembers everything. The way home begins where the trail disappears.",
    },
    {
      title: "Last Spring in Kyoto",
      slug: "last-spring-in-kyoto",
      art: "sakura",
      author: "author2",
      genre: "Slice of life",
      access: "membership",
      synopsis:
        "Some goodbyes take an entire season. Two friends return to the city where everything began, one spring afternoon.",
    },
    {
      title: "Low Orbit",
      slug: "low-orbit",
      art: "orbit",
      author: "author",
      genre: "Sci-fi",
      access: "both",
      synopsis:
        "Home is a moving target, two hundred miles above the earth. A quiet space station is about to receive an unexpected visitor.",
    },
    {
      title: "Ember & Ash",
      slug: "ember-and-ash",
      art: "sand",
      author: "author2",
      genre: "Fantasy",
      access: "free",
      synopsis:
        "Two sisters inherit a kingdom nobody wants to rule. A small, complete adventure about promises and second chances.",
    },
    {
      title: "The Quiet Hours",
      slug: "the-quiet-hours",
      art: "forest",
      author: "author",
      genre: "Mystery",
      access: "purchase",
      synopsis:
        "Every night at 3:17, the town forgets one person. A librarian starts leaving herself notes before the clocks stop.",
    },
    {
      title: "Redline District",
      slug: "redline-district",
      art: "neon",
      author: "author",
      genre: "Action",
      access: "both",
      synopsis:
        "One last race through a city built on borrowed time. No second place, no easy way out, and one promise left to keep.",
    },
  ];
  const storage = createStorage();
  for (const [index, entry] of titles.entries()) {
    if (
      await db
        .collection<PublicationDoc>("publications")
        .findOne({ slug: entry.slug })
    )
      continue;
    const id = randomUUID(),
      authorId = ids.get(entry.author)!;
    const svg = await readFile(`assets/${entry.art}.svg`);
    const coverKey = `seed/${id}/cover.webp`;
    await storage.put(
      coverKey,
      await sharp(svg).resize(900, 1000).webp({ quality: 85 }).toBuffer(),
      "image/webp",
    );
    for (let page = 1; page <= 8; page++) {
      const caption = `<svg width="900" height="1000"><path d="M0 470L900 390" stroke="white" stroke-width="12"/><rect x="70" y="70" width="520" height="90" fill="#fff9eb" stroke="#172238" stroke-width="4"/><text x="95" y="108" font-size="22" fill="#172238" font-family="sans-serif">${["The story begins where the light ends.", "There must be another way.", "The city was keeping a secret.", "This is only the beginning."][(page - 1) % 4]}</text><text x="95" y="143" font-size="14" fill="#172238" font-family="sans-serif">Astra Comics · Sample story page ${page}</text><rect x="680" y="920" width="150" height="40" fill="#fff9eb"/><text x="700" y="947" font-size="20" fill="#172238" font-family="sans-serif">${page} / 8</text></svg>`;
      const bytes = await sharp(svg)
        .resize(900, 1000)
        .modulate({ hue: page * 5 })
        .composite([{ input: Buffer.from(caption) }])
        .webp({ quality: 85 })
        .toBuffer();
      const key = `seed/${id}/pages/${page}.webp`;
      await storage.put(key, bytes, "image/webp");
      await db
        .collection<PageDoc>("pages")
        .insertOne({
          _id: randomUUID(),
          comicId: id,
          number: page,
          storageKey: key,
          alt: `Sample illustrated scene from ${entry.title}, page ${page}.`,
          bytes: bytes.byteLength,
        });
    }
    const date = new Date(Date.now() - index * 60_000);
    const publication: Publication = {
      ...entry,
      id,
      authorId,
      authorName: people.find((p) => p.key === entry.author)!.name,
      kind: "comic",
      ageRating: "teen",
      rightsConfirmed: true,
      status: "published",
      coverKey,
      pageCount: 8,
      version: 1,
      feedback: null,
      createdAt: date,
      updatedAt: date,
      publishedAt: date,
    };
    // Explicit projection avoids persisting seed-only fields such as local file names.
    const {
      art: _art,
      author: _author,
      ...clean
    } = publication as Publication & { art: string; author: string };
    void _art;
    void _author;
    await db
      .collection<PublicationDoc>("publications")
      .insertOne(toDocument(clean));
  }
  for (const [index, entry] of titles.slice(0, 3).entries()) {
    const slug = `${entry.slug}-concept-art`;
    if (await db.collection<PublicationDoc>("publications").findOne({ slug }))
      continue;
    const source = await db
      .collection<PublicationDoc>("publications")
      .findOne({ slug: entry.slug });
    if (!source) continue;
    await db
      .collection<PublicationDoc>("publications")
      .insertOne({
        ...source,
        _id: randomUUID(),
        slug,
        title: ["City of borrowed light", "The salt kingdoms", "Into the hush"][
          index
        ]!,
        kind: "artwork",
        access: "free",
        pageCount: 0,
      });
  }
  const memberId = ids.get("member")!;
  if (
    !(await db
      .collection<GrantDoc>("entitlements")
      .findOne({ userId: memberId, kind: "membership" }))
  )
    await db
      .collection<GrantDoc>("entitlements")
      .insertOne({
        _id: randomUUID(),
        userId: memberId,
        kind: "membership",
        comicId: null,
        expiresAt: new Date(Date.now() + 30 * 86400_000),
        revokedAt: null,
      });
  console.log(
    "Seed complete. Local accounts: admin@astra.test, author@astra.test, author2@astra.test, reader@astra.test, member@astra.test. Password is SEED_PASSWORD in .env.local. No production billing or entitlement API was created.",
  );
}
main().finally(closeMongo);
