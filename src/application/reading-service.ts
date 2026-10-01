import type {
  CommunityRepository,
  EntitlementRepository,
  ObjectStorage,
  PublicationRepository,
} from "./ports";
import type { User } from "@/domain/models";
import { readingAccess } from "@/domain/access";
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
