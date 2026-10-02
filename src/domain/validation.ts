import { z } from "zod";
import { genres } from "./models";
import { MAX_CHAPTERS } from "./chapters";

export const idSchema = z.string().uuid();
export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(12, "Use at least 12 characters.").max(128),
  })
  .strict();
export const loginSchema = registerSchema.pick({ email: true, password: true });
export const publicationSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    synopsis: z.string().trim().min(20).max(1500),
    genre: z.enum(genres),
    kind: z.enum(["comic", "artwork"]),
    access: z.enum(["free", "membership", "purchase", "both"]),
    ageRating: z.enum(["everyone", "teen", "mature"]),
    tags: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(40)
          .transform((value) => value.toLowerCase()),
      )
      .max(20)
      .transform((values) => [...new Set(values)])
      .optional(),
    pricePaise: z.number().int().min(1).max(100_000_000).nullable().optional(),
    rightsConfirmed: z.boolean(),
  })
  .strict()
  .refine((value) => value.kind !== "artwork" || value.access === "free", {
    message: "Artwork is publicly viewable; use free access.",
    path: ["access"],
  });
export const pageTextSchema = z
  .object({
    version: z.number().int().min(1),
    alt: z.string().trim().min(10).max(1000),
    storyText: z.string().trim().max(12000),
  })
  .strict();
export type PublicationInput = z.infer<typeof publicationSchema>;
export const versionSchema = z
  .object({ version: z.number().int().min(1) })
  .strict();
export const updatePublicationSchema = z
  .object({ publication: publicationSchema, version: z.number().int().min(1) })
  .strict();
export const catalogSchema = z.object({
  genre: z.enum(genres).optional(),
  access: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["free", "membership", "purchase", "both"]).optional(),
  ),
  search: z.string().trim().max(80).optional(),
  cursor: z.string().max(240).optional(),
  limit: z.coerce.number().int().min(1).max(24).default(12),
  kind: z.enum(["comic", "artwork"]).default("comic"),
});
export const reviewSchema = z
  .object({
    version: z.number().int().min(1),
    decision: z.enum(["published", "changes_requested", "rejected"]),
    note: z.string().trim().max(1000),
  })
  .strict()
  .refine(
    (value) => value.decision === "published" || value.note.length >= 10,
    {
      message: "Give the author at least 10 characters of actionable feedback.",
      path: ["note"],
    },
  );
export const reportSchema = z
  .object({ reason: z.string().trim().min(10).max(1000) })
  .strict();
export const userUpdateSchema = z
  .object({
    role: z.enum(["reader", "author", "admin"]),
    status: z.enum(["active", "suspended"]),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export const policySchema = z
  .object({ adsEnabled: z.boolean(), submissionsEnabled: z.boolean() })
  .strict();
export const progressSchema = z
  .object({ page: z.number().int().min(1) })
  .strict();
export const toggleSchema = z.object({ enabled: z.boolean() }).strict();

export const chapterInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1, "Give every chapter a title.").max(100),
    startPage: z.number().int().min(1),
  })
  .strict();
export const chaptersSchema = z
  .object({
    version: z.number().int().min(1),
    chapters: z.array(chapterInputSchema).max(MAX_CHAPTERS),
  })
  .strict();
export type ChapterInput = z.infer<typeof chapterInputSchema>;
