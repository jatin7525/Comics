import type {
  CommunityRepository,
  EntitlementRepository,
  ObjectStorage,
  PublicationRepository,
} from "./ports";
import type { User } from "@/domain/models";
import { PREVIEW_PAGES, readingAccess } from "@/domain/access";
import { ensure } from "@/domain/errors";

export class ReadingService {
  constructor(
    private readonly publications: PublicationRepository,
    private readonly entitlements: EntitlementRepository,
    private readonly storage: ObjectStorage,
    private readonly community: CommunityRepository,
  ) {}
  async access(id: string, page: number, user: User | null) {
    const publication = await this.publications.find(id);
    ensure(
      publication && publication.status === "published",
      "NOT_FOUND",
      "This comic is not available.",
      404,
    );
    const grants =
      user && page > 4 && publication.access !== "free"
        ? await this.entitlements.forReader(user.id, id)
        : [];
    return {
      publication,
      decision: readingAccess(publication, page, user, grants),
    };
  }
  // Returns consecutive readable pages from `from`, stopping at the first page the reader may not
  // open. Only the page number and image description are returned; story text is not shown to readers.
  async pages(id: string, from: number, limit: number, user: User | null) {
    const publication = await this.publications.find(id);
    ensure(
      publication &&
        publication.status === "published" &&
        publication.kind === "comic" &&
        Number.isSafeInteger(from) &&
        from >= 1 &&
        from <= publication.pageCount,
      "NOT_FOUND",
      "This comic is not available.",
      404,
    );
    const to = Math.min(publication.pageCount, from + limit - 1);
    const grants =
      user && to > PREVIEW_PAGES && publication.access !== "free"
        ? await this.entitlements.forReader(user.id, id)
        : [];
    let last = from - 1;
    let gate: "login_required" | "payment_required" | null = null;
    for (let page = from; page <= to; page++) {
      const decision = readingAccess(publication, page, user, grants);
      if (!decision.allowed) {
        if (
          decision.reason === "login_required" ||
          decision.reason === "payment_required"
        )
          gate = decision.reason;
        break;
      }
      last = page;
    }
    const pages =
      last >= from ? await this.publications.pageRange(id, from, last) : [];
    return {
      publication,
      pages: pages.map(({ number, alt }) => ({ number, alt })),
      gate,
      gatePage: gate ? last + 1 : null,
      nextFrom: !gate && last < publication.pageCount ? last + 1 : null,
    };
  }
  async image(id: string, page: number, user: User | null) {
    const { decision } = await this.access(id, page, user);
    ensure(
      decision.allowed,
      decision.reason.toUpperCase(),
      decision.reason === "login_required"
        ? "Sign in to read beyond the preview."
        : "This page requires an active entitlement.",
      decision.reason === "unavailable"
        ? 404
        : decision.reason === "login_required"
          ? 401
          : 403,
    );
    const record = await this.publications.page(id, page);
    ensure(record, "NOT_FOUND", "Comic page not found.", 404);
    const object = await this.storage.get(record.storageKey);
    ensure(
      object,
      "MEDIA_UNAVAILABLE",
      "This page is temporarily unavailable.",
      503,
    );
    return object;
  }
  async progress(id: string, page: number, user: User) {
    const { decision } = await this.access(id, page, user);
    ensure(
      decision.allowed,
      "FORBIDDEN",
      "Only accessible pages can be marked as read.",
      403,
    );
    await this.community.recordProgress(user.id, id, page);
  }
}
