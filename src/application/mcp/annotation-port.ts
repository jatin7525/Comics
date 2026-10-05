import type { ImageAnnotation } from "@/domain/mcp/annotations";
import type { AuditEvent } from "@/domain/models";
export interface AnnotationRepository {
  find(pageId: string): Promise<ImageAnnotation | null>;
  save(
    annotation: ImageAnnotation,
    expectedVersion: number,
    audit: AuditEvent,
  ): Promise<boolean>;
  search(query: {
    comicIds: string[];
    character?: string;
    tag?: string;
    cursor?: string;
    limit: number;
  }): Promise<ImageAnnotation[]>;
}
