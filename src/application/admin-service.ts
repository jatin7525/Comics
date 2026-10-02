import { randomUUID } from "node:crypto";
import type { AdministrationRepository, PublicationRepository } from "./ports";
import type {
  AuditEvent,
  Chapter,
  PlatformPolicy,
  User,
} from "@/domain/models";
import { validChapters } from "@/domain/chapters";
import { ensure } from "@/domain/errors";

export function requireAdmin(actor: User) {
  ensure(
    actor.role === "admin" && actor.status === "active",
    "FORBIDDEN",
    "Administrator access is required.",
    403,
  );
}
function audit(
  actor: User,
  action: string,
  targetId: string,
  details: string,
): AuditEvent {
  return {
    id: randomUUID(),
    actorId: actor.id,
    actorName: actor.name,
    action,
    targetId,
    details,
    createdAt: new Date(),
  };
}
export class AdminService {
  constructor(
    private readonly administration: AdministrationRepository,
    private readonly publications: PublicationRepository,
  ) {}
  async review(
    actor: User,
    id: string,
    input: {
      version: number;
      decision: "published" | "changes_requested" | "rejected";
      note: string;
    },
  ) {
    requireAdmin(actor);
    const current = await this.publications.find(id);
    ensure(current, "NOT_FOUND", "Publication not found.", 404);
    // Originals are the platform's own publications, so the administrator who made one may publish it.
    ensure(
      current.authorId !== actor.id || current.original,
      "SELF_REVIEW",
      "A different administrator must review your publication.",
      403,
    );
    if (input.decision === "published")
      ensure(
        current.coverKey &&
          current.rightsConfirmed &&
          (current.kind === "artwork" || current.pageCount >= 5),
        "INCOMPLETE",
        "This submission is missing required publishing assets.",
      );
    else
      ensure(
        input.note.trim().length >= 10,
        "FEEDBACK_REQUIRED",
        "Provide actionable editorial feedback.",
      );
    ensure(
      await this.publications.update(
        id,
        input.version,
        ["submitted"],
        {
          status: input.decision,
          feedback: input.note || null,
          publishedAt: input.decision === "published" ? new Date() : null,
        },
        audit(actor, `publication.${input.decision}`, id, input.note),
      ),
      "CONFLICT",
      "This submission has already changed. Reload the review queue.",
      409,
    );
  }
  async reviewRelease(
    actor: User,
    id: string,
    input: {
      version: number;
      decision: "approved" | "changes_requested";
      note: string;
    },
  ) {
    requireAdmin(actor);
    const current = await this.publications.find(id);
    const release = current?.release;
    ensure(
      current &&
        current.status === "published" &&
        release?.status === "submitted",
      "CONFLICT",
      "This chapter is no longer awaiting review. Reload the queue.",
      409,
    );
    ensure(
      current.authorId !== actor.id || current.original,
      "SELF_REVIEW",
      "A different administrator must review your chapter.",
      403,
    );
    const entry = audit(
      actor,
      `chapter_release.${input.decision}`,
      id,
      `${release.title}: ${input.note}`,
    );
    if (input.decision === "changes_requested") {
      ensure(
        input.note.trim().length >= 10,
        "FEEDBACK_REQUIRED",
        "Provide actionable editorial feedback.",
      );
      ensure(
        await this.publications.update(
          id,
          input.version,
          ["published"],
          {
            release: {
              ...release,
              status: "changes_requested",
              feedback: input.note,
              updatedAt: new Date(),
            },
          },
          entry,
        ),
        "CONFLICT",
        "This chapter has already changed. Reload the queue.",
        409,
      );
      return;
    }
    // A comic published before chapters existed gets its earlier pages as Chapter 1.
    const existing: Chapter[] = current.chapters?.length
      ? current.chapters
      : [{ id: randomUUID(), title: "Chapter 1", startPage: 1 }];
    const chapters = [
      ...existing,
      {
        id: release.id,
        title: release.title,
        startPage: current.pageCount + 1,
      },
    ];
    ensure(
      validChapters(chapters, current.pageCount + release.pageCount),
      "INVALID_CHAPTERS",
      "The existing chapters do not line up with the comic's pages.",
    );
    ensure(
      await this.publications.approveRelease(
        id,
        input.version,
        chapters,
        entry,
      ),
      "CONFLICT",
      "This chapter has already changed. Reload the queue.",
      409,
    );
  }
  async hide(actor: User, id: string, version: number, reason: string) {
    requireAdmin(actor);
    ensure(
      reason.trim().length >= 10,
      "REASON_REQUIRED",
      "Explain why this publication is being hidden.",
    );
    ensure(
      await this.publications.update(
        id,
        version,
        ["published"],
        { status: "hidden", feedback: reason },
        audit(actor, "publication.hidden", id, reason),
      ),
      "CONFLICT",
      "This publication changed. Reload the library.",
      409,
    );
  }
  async updateUser(
    actor: User,
    id: string,
    role: User["role"],
    status: User["status"],
    reason: string,
  ) {
    requireAdmin(actor);
    ensure(
      actor.id !== id && role !== "admin",
      "ROLE_PROTECTED",
      "Administrator grants require an operator-reviewed process.",
      403,
    );
    await this.administration.updateUser(
      id,
      { role, status },
      audit(actor, "account.updated", id, `${role}; ${status}; ${reason}`),
    );
  }
  async policy(
    actor: User,
    patch: Pick<PlatformPolicy, "adsEnabled" | "submissionsEnabled"> &
      Partial<Pick<PlatformPolicy, "siteName">>,
  ) {
    requireAdmin(actor);
    await this.administration.updatePolicy(
      patch,
      audit(actor, "policy.updated", "platform", JSON.stringify(patch)),
    );
  }
  async resolve(actor: User, id: string, reason: string) {
    requireAdmin(actor);
    ensure(
      await this.administration.resolveReport(
        id,
        audit(actor, "report.resolved", id, reason),
      ),
      "CONFLICT",
      "This report has already been resolved.",
      409,
    );
  }
}
