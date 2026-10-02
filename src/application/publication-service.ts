import { randomUUID } from "node:crypto";
import type {
  AdministrationRepository,
  ObjectStorage,
  PublicationRepository,
} from "./ports";
import type { Publication, User } from "@/domain/models";
import {
  publicationSchema,
  pageTextSchema,
  type PublicationInput,
} from "@/domain/validation";
import { ensure } from "@/domain/errors";
import { canManagePublication } from "@/domain/access";

const editable: Publication["status"][] = ["draft", "changes_requested"];
export class PublicationService {
  constructor(
    private readonly publications: PublicationRepository,
    private readonly storage: ObjectStorage,
    private readonly administration: AdministrationRepository,
  ) {}
  async create(actor: User, input: PublicationInput) {
    input = publicationSchema.parse(input);
    ensure(
      actor.status === "active" && ["author", "admin"].includes(actor.role),
      "FORBIDDEN",
      "Publishing requires an authorized author account.",
      403,
    );
    const id = randomUUID();
    const prefix =
      input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 70) || "story";
    const publication: Publication = {
      ...input,
      id,
      slug: `${prefix}-${id.slice(0, 8)}`,
      authorId: actor.id,
      authorName: actor.name,
      status: "draft",
      coverKey: null,
      pageCount: 0,
      version: 1,
      feedback: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: null,
    };
    await this.publications.create(publication);
    return publication;
  }
  async owned(actor: User, id: string) {
    const publication = await this.publications.find(id);
    ensure(
      publication && canManagePublication(actor, publication),
      "NOT_FOUND",
      "Publication not found.",
      404,
    );
    return publication;
  }
  async edit(
    actor: User,
    id: string,
    version: number,
    input: PublicationInput,
  ) {
    input = publicationSchema.parse(input);
    const current = await this.owned(actor, id);
    ensure(
      current.kind === input.kind,
      "KIND_IMMUTABLE",
      "Create a separate publication to change its type.",
    );
    ensure(
      await this.publications.update(id, version, editable, input),
      "CONFLICT",
      "This publication changed or is no longer editable. Reload before saving.",
      409,
    );
  }
  async upload(
    actor: User,
    id: string,
    version: number,
    kind: "cover" | "page",
    data: Uint8Array,
    alt: string,
  ) {
    const current = await this.owned(actor, id);
    ensure(
      editable.includes(current.status) && current.version === version,
      "CONFLICT",
      "This publication changed or is awaiting review. Reload before uploading.",
      409,
    );
    ensure(
      kind === "cover" || current.kind === "comic",
      "INVALID_UPLOAD",
      "Artwork uses a single cover image.",
    );
    const key = `publications/${id}/${kind}/${randomUUID()}.webp`;
    await this.storage.put(key, data, "image/webp");
    let committed = false;
    try {
      committed =
        kind === "cover"
          ? await this.publications.update(id, version, editable, {
              coverKey: key,
            })
          : await this.publications.addPage(current, {
              id: randomUUID(),
              comicId: id,
              number: current.pageCount + 1,
              storageKey: key,
              alt,
              bytes: data.byteLength,
            });
      ensure(
        committed,
        "CONFLICT",
        "Another edit was saved first. Reload and try again.",
        409,
      );
    } finally {
      if (!committed)
        await this.storage
          .delete(key)
          .catch(() =>
            console.error("storage_cleanup_failed", { publicationId: id }),
          );
    }
    // Old covers remain for recovery; the cleanup job described in operations removes unreferenced objects.
  }
  async reorder(actor: User, id: string, version: number, ids: string[]) {
    const current = await this.owned(actor, id);
    ensure(
      current.kind === "comic",
      "INVALID_KIND",
      "Only comics have ordered pages.",
    );
    ensure(
      await this.publications.reorderPages(id, version, ids),
      "CONFLICT",
      "Pages changed or the order is invalid. Reload before saving.",
      409,
    );
  }
  async editPage(
    actor: User,
    id: string,
    version: number,
    pageId: string,
    alt: string,
    storyText: string,
  ) {
    pageTextSchema.parse({ version, alt, storyText });
    await this.owned(actor, id);
    ensure(
      await this.publications.editPage(id, version, pageId, alt, storyText),
      "CONFLICT",
      "This page changed or is no longer editable. Reload.",
      409,
    );
  }
  async submit(actor: User, id: string, version: number) {
    const current = await this.owned(actor, id);
    ensure(
      !["purchase", "both"].includes(current.access) ||
        (current.pricePaise ?? 0) > 0,
      "PRICE_REQUIRED",
      "Set a purchase price before submitting.",
    );
    const policy = await this.administration.policy();
    ensure(
      policy.submissionsEnabled,
      "SUBMISSIONS_PAUSED",
      "Submissions are temporarily paused. Your draft is saved.",
      409,
    );
    ensure(
      current.rightsConfirmed,
      "RIGHTS_REQUIRED",
      "Confirm your publishing rights before submitting.",
    );
    ensure(
      current.coverKey,
      "COVER_REQUIRED",
      "Upload a cover before submitting.",
    );
    ensure(
      current.kind === "artwork" || current.pageCount >= 5,
      "PAGES_REQUIRED",
      "Upload at least five sequential pages before submitting a comic.",
    );
    ensure(
      await this.publications.update(id, version, editable, {
        status: "submitted",
        feedback: null,
      }),
      "CONFLICT",
      "This publication changed. Reload before submitting.",
      409,
    );
  }
}
