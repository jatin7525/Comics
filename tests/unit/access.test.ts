import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readingAccess, canManagePublication } from "../../src/domain/access";
import {
  chapterForPage,
  chapterRanges,
  validChapters,
} from "../../src/domain/chapters";
import type { Entitlement, Publication, User } from "../../src/domain/models";
import {
  catalogSchema,
  chaptersSchema,
  publicationSchema,
  registerSchema,
  reviewSchema,
} from "../../src/domain/validation";
import {
  hashPassword,
  verifyPassword,
} from "../../src/application/auth-service";

const now = new Date("2026-10-01T00:00:00Z");
const user: User = {
  id: "reader",
  name: "Reader",
  email: "reader@example.test",
  role: "reader",
  status: "active",
  createdAt: now,
};
const comic: Publication = {
  id: "comic",
  slug: "test",
  authorId: "author",
  authorName: "Author",
  title: "A test story",
  synopsis: "A long enough synopsis.",
  genre: "Fantasy",
  kind: "comic",
  access: "membership",
  ageRating: "everyone",
  rightsConfirmed: true,
  status: "published",
  coverKey: "private",
  pageCount: 10,
  version: 1,
  feedback: null,
  createdAt: now,
  updatedAt: now,
  publishedAt: now,
};
const member: Entitlement = {
  id: "grant",
  userId: user.id,
  kind: "membership",
  comicId: null,
  expiresAt: new Date("2026-11-01T00:00:00Z"),
  revokedAt: null,
};
const purchase: Entitlement = {
  ...member,
  kind: "purchase",
  comicId: comic.id,
  expiresAt: null,
};

describe("server reading policy", () => {
  for (const access of ["free", "membership", "purchase", "both"] as const) {
    it(`opens exactly four guest pages for ${access}`, () => {
      for (const page of [1, 2, 3, 4])
        assert.equal(
          readingAccess({ ...comic, access }, page, null, [], now).allowed,
          true,
        );
      assert.deepEqual(readingAccess({ ...comic, access }, 5, null, [], now), {
        allowed: false,
        reason: "login_required",
      });
    });
  }
  it("requires login even for free page five", () => {
    assert.equal(
      readingAccess({ ...comic, access: "free" }, 5, user, [], now).allowed,
      true,
    );
    assert.equal(readingAccess(comic, 5, user, [], now).allowed, false);
  });
  it("does not let membership unlock purchase-only titles", () => {
    assert.equal(
      readingAccess({ ...comic, access: "purchase" }, 5, user, [member], now)
        .allowed,
      false,
    );
    assert.equal(readingAccess(comic, 5, user, [member], now).allowed, true);
  });
  it("scopes purchases to the correct reader and title", () => {
    assert.equal(
      readingAccess({ ...comic, access: "purchase" }, 5, user, [purchase], now)
        .allowed,
      true,
    );
    assert.equal(
      readingAccess(
        { ...comic, access: "purchase" },
        5,
        user,
        [{ ...purchase, comicId: "different" }],
        now,
      ).allowed,
      false,
    );
    assert.equal(
      readingAccess(comic, 5, user, [{ ...member, userId: "other" }], now)
        .allowed,
      false,
    );
  });
  it("rejects expired or revoked grants", () => {
    assert.equal(
      readingAccess(comic, 5, user, [{ ...member, expiresAt: now }], now)
        .allowed,
      false,
    );
    assert.equal(
      readingAccess(comic, 5, user, [{ ...member, revokedAt: now }], now)
        .allowed,
      false,
    );
  });
  it("accepts either supported grant for dual-access titles", () => {
    for (const grant of [member, purchase])
      assert.equal(
        readingAccess({ ...comic, access: "both" }, 5, user, [grant], now)
          .allowed,
        true,
      );
  });
  it("never exposes unpublished pages or invalid page numbers", () => {
    for (const status of [
      "draft",
      "submitted",
      "changes_requested",
      "rejected",
      "hidden",
    ] as const)
      assert.equal(
        readingAccess({ ...comic, status }, 1, user, [member], now).allowed,
        false,
      );
    for (const page of [0, -1, 1.5, 11, NaN, Infinity])
      assert.equal(
        readingAccess(comic, page, user, [member], now).allowed,
        false,
      );
  });
  it("does not grant read access because somebody is an admin", () => {
    assert.equal(
      readingAccess(comic, 5, { ...user, role: "admin" }, [], now).allowed,
      false,
    );
  });
  it("rejects suspended readers", () =>
    assert.equal(
      readingAccess(comic, 1, { ...user, status: "suspended" }, [], now)
        .allowed,
      false,
    ));
});
describe("authorization and request validation", () => {
  it("requires author ownership or admin for studio access", () => {
    assert.equal(
      canManagePublication({ ...user, role: "author" }, comic),
      false,
    );
    assert.equal(
      canManagePublication(
        { ...user, id: comic.authorId, role: "author" },
        comic,
      ),
      true,
    );
    assert.equal(canManagePublication({ ...user, role: "admin" }, comic), true);
    assert.equal(
      canManagePublication(
        { ...user, id: comic.authorId, role: "author", status: "suspended" },
        comic,
      ),
      false,
    );
  });
  it("rejects role escalation through registration", () =>
    assert.equal(
      registerSchema.safeParse({
        name: "Alex",
        email: "alex@example.test",
        password: "long-enough-password",
        role: "admin",
      }).success,
      false,
    ));
  it("requires review feedback for rejection or changes", () => {
    assert.equal(
      reviewSchema.safeParse({ version: 1, decision: "rejected", note: "" })
        .success,
      false,
    );
    assert.equal(
      reviewSchema.safeParse({
        version: 1,
        decision: "changes_requested",
        note: "Fix",
      }).success,
      false,
    );
  });
  it("does not allow paid standalone artwork or unknown fields", () => {
    const input = {
      title: "Valid title",
      synopsis: "A meaningful synopsis for this art.",
      genre: "Fantasy",
      kind: "artwork",
      access: "purchase",
      ageRating: "everyone",
      rightsConfirmed: true,
    };
    assert.equal(publicationSchema.safeParse(input).success, false);
    assert.equal(
      publicationSchema.safeParse({
        ...input,
        access: "free",
        authorId: "another",
      }).success,
      false,
    );
  });
  it("salts passwords and rejects invalid credentials", async () => {
    const first = await hashPassword("safe-test-password");
    const second = await hashPassword("safe-test-password");
    assert.notEqual(first, second);
    assert.equal(await verifyPassword("safe-test-password", first), true);
    assert.equal(await verifyPassword("wrong", first), false);
    assert.equal(await verifyPassword("safe-test-password", "broken"), false);
  });
});

it("accepts an empty access selector but rejects unknown access modes", () => {
  assert.equal(
    catalogSchema.parse({ access: "", search: "" }).access,
    undefined,
  );
  assert.equal(catalogSchema.safeParse({ access: "admin" }).success, false);
});

it("stores normalized tags and accepts only integer minor-unit prices", () => {
  const input = {
    title: "A new comic",
    synopsis: "An original comic with a full synopsis.",
    genre: "Fantasy",
    kind: "comic",
    access: "purchase",
    ageRating: "everyone",
    rightsConfirmed: true,
    tags: [" Space ", "space"],
    pricePaise: 14950,
  };
  assert.deepEqual(publicationSchema.parse(input).tags, ["space"]);
  for (const pricePaise of [-1, 0, 1.5, Infinity])
    assert.equal(
      publicationSchema.safeParse({ ...input, pricePaise }).success,
      false,
    );
});
describe("comic chapters", () => {
  const chapters = [
    { id: "one", title: "Arrival", startPage: 1 },
    { id: "two", title: "The long night", startPage: 3 },
    { id: "three", title: "Dawn", startPage: 8 },
  ];
  it("derives contiguous page ranges from chapter starts", () => {
    const ranges = chapterRanges({ ...comic, chapters });
    assert.deepEqual(
      ranges.map(({ number, startPage, endPage }) => [
        number,
        startPage,
        endPage,
      ]),
      [
        [1, 1, 2],
        [2, 3, 7],
        [3, 8, 10],
      ],
    );
    assert.equal(chapterForPage(ranges, 7)?.title, "The long night");
    assert.equal(chapterForPage(ranges, 11), undefined);
  });
  it("treats comics without chapters as one continuous story", () => {
    assert.deepEqual(chapterRanges(comic), []);
    assert.deepEqual(
      chapterRanges({ ...comic, kind: "artwork", chapters }),
      [],
    );
  });
  it("rejects gaps, overlaps, empty chapters and duplicate IDs", () => {
    assert.equal(validChapters([], 0), true);
    assert.equal(validChapters(chapters, 10), true);
    assert.equal(validChapters([{ id: "a", startPage: 2 }], 10), false);
    assert.equal(validChapters(chapters, 7), false);
    assert.equal(
      validChapters(
        [
          { id: "a", startPage: 1 },
          { id: "b", startPage: 1 },
        ],
        10,
      ),
      false,
    );
    assert.equal(
      validChapters(
        [
          { id: "a", startPage: 1 },
          { id: "a", startPage: 4 },
        ],
        10,
      ),
      false,
    );
    assert.deepEqual(chapterRanges({ ...comic, pageCount: 5, chapters }), []);
  });
  it("keeps the guest preview per comic, not per chapter", () => {
    const chaptered = { ...comic, chapters };
    assert.equal(readingAccess(chaptered, 3, null, [], now).allowed, true);
    assert.equal(
      readingAccess(chaptered, 8, null, [], now).reason,
      "login_required",
    );
    assert.equal(
      readingAccess(chaptered, 8, user, [], now).reason,
      "payment_required",
    );
  });
  it("validates chapter input strictly", () => {
    assert.equal(
      chaptersSchema.safeParse({
        version: 1,
        chapters: [{ title: "  ", startPage: 1 }],
      }).success,
      false,
    );
    assert.equal(
      chaptersSchema.safeParse({
        version: 1,
        chapters: [{ title: "Arrival", startPage: 1, endPage: 4 }],
      }).success,
      false,
    );
    assert.equal(
      chaptersSchema.safeParse({
        version: 1,
        chapters: [{ title: "Arrival", startPage: 1 }],
      }).success,
      true,
    );
  });
});
