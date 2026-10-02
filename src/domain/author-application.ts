import { z } from "zod";
export const applicationInput = z
  .object({
    introduction: z.string().trim().min(30).max(2000),
    portfolioUrl: z
      .union([
        z.literal(""),
        z
          .url()
          .max(2000)
          .refine(
            (value) => new URL(value).protocol === "https:",
            "Use an HTTPS portfolio URL.",
          ),
      ])
      .default(""),
    sampleKind: z.enum(["artwork", "comic"]),
    processNotes: z.string().trim().min(30).max(2000),
    rightsConfirmed: z.literal(true, {
      error:
        "Confirm that you created this work and have the right to submit it.",
    }),
  })
  .strict();
export type ApplicationInput = z.infer<typeof applicationInput>;
export type ApplicationStatus =
  "draft" | "submitted" | "changes_requested" | "rejected" | "approved";
export interface ApplicationSample {
  id: string;
  storageKey: string;
  alt: string;
}
export interface AuthorApplication {
  id: string;
  userId: string;
  name: string;
  status: ApplicationStatus;
  version: number;
  introduction: string;
  portfolioUrl: string;
  sampleKind: "artwork" | "comic";
  processNotes: string;
  rightsConfirmed: boolean;
  samples: ApplicationSample[];
  thumbnail?: ApplicationSample | null;
  feedback: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const applicationReview = z
  .object({
    version: z.number().int().min(1),
    decision: z.enum(["approved", "changes_requested", "rejected"]),
    note: z.string().trim().min(10).max(1500),
    reviewedSamples: z.literal(true),
  })
  .strict();
export type ApplicationReview = z.infer<typeof applicationReview>;
export function editableApplication(status: ApplicationStatus) {
  return ["draft", "changes_requested", "rejected"].includes(status);
}
