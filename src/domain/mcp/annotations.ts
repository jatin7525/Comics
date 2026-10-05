import { z } from "zod";
const tag = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .transform((s) => s.toLowerCase());
export const annotationSchema = z
  .object({
    characters: z
      .array(tag)
      .max(20)
      .transform((a) => [...new Set(a)]),
    tags: z
      .array(tag)
      .max(30)
      .transform((a) => [...new Set(a)]),
    description: z.string().trim().max(2000),
  })
  .strict();
export type ImageLabels = z.infer<typeof annotationSchema>;
export interface ImageAnnotation extends ImageLabels {
  id: string;
  comicId: string;
  imageRevision: string;
  version: number;
  updatedAt: Date;
  updatedBy: string;
}
