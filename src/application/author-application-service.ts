import { randomUUID } from "node:crypto";
import type {
  ApplicationInput,
  ApplicationReview,
  AuthorApplication,
} from "@/domain/author-application";
import {
  applicationInput,
  applicationReview,
  editableApplication,
} from "@/domain/author-application";
import type { AuditEvent, User } from "@/domain/models";
import { ensure } from "@/domain/errors";
import type { ObjectStorage } from "./ports";
import { requireAdmin } from "./admin-service";

export interface AuthorApplicationRepository {
  mine(userId: string): Promise<AuthorApplication | null>;
  find(id: string): Promise<AuthorApplication | null>;
  queue(): Promise<AuthorApplication[]>;
  create(application: AuthorApplication): Promise<AuthorApplication>;
  update(
    id: string,
    version: number,
    patch: Partial<AuthorApplication>,
  ): Promise<boolean>;
  review(
    id: string,
    input: ApplicationReview,
    audit: AuditEvent,
  ): Promise<boolean>;
}
export class AuthorApplicationService {
  constructor(
    private readonly repository: AuthorApplicationRepository,
    private readonly storage: ObjectStorage,
  ) {}
  async start(user: User) {
    this.reader(user);
    return this.repository.create({
      id: randomUUID(),
      userId: user.id,
      name: user.name,
      status: "draft",
      version: 1,
      introduction: "",
      portfolioUrl: "",
      sampleKind: "artwork",
      processNotes: "",
      rightsConfirmed: false,
      samples: [],
      feedback: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  private reader(user: User) {
    ensure(
      user.status === "active" && user.role === "reader",
      "FORBIDDEN",
      "Only active readers can apply for author access.",
      403,
    );
  }
  async owned(user: User, id: string) {
    const application = await this.repository.find(id);
    ensure(
      user.status === "active" && application && application.userId === user.id,
      "NOT_FOUND",
      "Application not found.",
      404,
    );
    return application;
  }
  private async editable(user: User, id: string, version: number) {
    this.reader(user);
    const application = await this.owned(user, id);
    ensure(
      application.version === version &&
        editableApplication(application.status),
      "CONFLICT",
      "This application changed or is awaiting review. Reload before editing.",
      409,
    );
    return application;
  }
  async save(user: User, id: string, version: number, input: ApplicationInput) {
    input = applicationInput.parse(input);
    await this.editable(user, id, version);
    ensure(
      await this.repository.update(id, version, input),
      "CONFLICT",
      "Another change was saved first. Reload.",
      409,
    );
  }
  async upload(
    user: User,
    id: string,
    version: number,
    bytes: Uint8Array,
    alt: string,
    thumbnail = false,
  ) {
    const application = await this.editable(user, id, version);
    const sample = {
      id: randomUUID(),
      storageKey: `applications/${id}/${randomUUID()}.webp`,
      alt,
    };
    await this.storage.put(sample.storageKey, bytes, "image/webp");
    let committed = false;
    try {
      committed = await this.repository.update(id, version, {
        ...(thumbnail
          ? { thumbnail: sample }
          : { samples: [...application.samples, sample] }),
      });
      ensure(
        committed,
        "CONFLICT",
        "Another change was saved first. Reload.",
        409,
      );
    } finally {
      if (!committed) await this.storage.delete(sample.storageKey);
      else if (thumbnail && application.thumbnail)
        await this.storage.delete(application.thumbnail.storageKey);
    }
  }
  async reorder(user: User, id: string, version: number, ids: string[]) {
    const application = await this.editable(user, id, version);
    ensure(
      ids.length === application.samples.length &&
        new Set(ids).size === ids.length &&
        ids.every((id) =>
          application.samples.some((sample) => sample.id === id),
        ),
      "INVALID_ORDER",
      "Include every existing page exactly once.",
    );
    ensure(
      await this.repository.update(id, version, {
        samples: ids.map((id) =>
          application.samples.find((sample) => sample.id === id)!,
        ),
      }),
      "CONFLICT",
      "Another change was saved first. Reload.",
      409,
    );
  }
  async remove(user: User, id: string, version: number, sampleId: string) {
    const application = await this.editable(user, id, version);
    const isThumbnail = application.thumbnail?.id === sampleId;
    const sample = isThumbnail
      ? application.thumbnail
      : application.samples.find((item) => item.id === sampleId);
    ensure(sample, "NOT_FOUND", "Sample not found.", 404);
    ensure(
      await this.repository.update(id, version, {
        ...(isThumbnail
          ? { thumbnail: null }
          : {
              samples: application.samples.filter(
                (item) => item.id !== sampleId,
              ),
            }),
      }),
      "CONFLICT",
      "Another change was saved first. Reload.",
      409,
    );
    await this.storage.delete(sample.storageKey);
  }
  async submit(user: User, id: string, version: number) {
    const application = await this.editable(user, id, version);
    ensure(
      application.rightsConfirmed &&
        application.introduction.length >= 30 &&
        application.processNotes.length >= 30,
      "INCOMPLETE",
      "Save your introduction, creation process, and rights declaration first.",
    );
    ensure(
      application.samples.length >=
        (application.sampleKind === "comic" ? 2 : 1),
      "INCOMPLETE",
      "Add at least two pages for a short comic, or one original artwork.",
    );
    ensure(
      await this.repository.update(id, version, {
        status: "submitted",
        feedback: null,
      }),
      "CONFLICT",
      "Another change was saved first. Reload.",
      409,
    );
  }
  async image(user: User, id: string, sampleId: string, reviewer: boolean) {
    if (reviewer) requireAdmin(user);
    const application = reviewer
      ? await this.repository.find(id)
      : await this.owned(user, id);
    const sample =
      application?.thumbnail?.id === sampleId
        ? application.thumbnail
        : application?.samples.find((item) => item.id === sampleId);
    ensure(sample, "NOT_FOUND", "Sample not found.", 404);
    const object = await this.storage.get(sample.storageKey);
    ensure(object, "NOT_FOUND", "Sample not found.", 404);
    return object;
  }
  async review(user: User, id: string, input: ApplicationReview) {
    requireAdmin(user);
    input = applicationReview.parse(input);
    const application = await this.repository.find(id);
    ensure(
      application && application.userId !== user.id,
      "FORBIDDEN",
      "You cannot review your own application.",
      403,
    );
    ensure(
      await this.repository.review(id, input, {
        id: randomUUID(),
        actorId: user.id,
        actorName: user.name,
        targetId: id,
        action: `author_application.${input.decision}`,
        details: input.note,
        createdAt: new Date(),
      }),
      "CONFLICT",
      "This application or account changed. Reload before reviewing.",
      409,
    );
  }
}
