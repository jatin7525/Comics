import type {
  Account,
  AuditEvent,
  ComicPage,
  Entitlement,
  PlatformPolicy,
  Publication,
  ReaderReport,
  Session,
} from "@/domain/models";
export type Document<T extends { id: string }> = Omit<T, "id"> & {
  _id: string;
};
export type AccountDoc = Document<Account>;
export type PublicationDoc = Document<Publication>;
export type PageDoc = Document<ComicPage>;
export type SessionDoc = Document<Session>;
export type GrantDoc = Document<Entitlement>;
export type AuditDoc = Document<AuditEvent>;
export type ReportDoc = Document<ReaderReport>;
export type PolicyDoc = Document<PlatformPolicy>;
export function toDocument<T extends { id: string }>(value: T): Document<T> {
  const { id, ...rest } = value;
  return { ...rest, _id: id };
}
export function fromDocument<T extends { id: string }>(value: Document<T>): T {
  const { _id, ...rest } = value;
  // This reverses toDocument exactly; Mongo-specific IDs never reach the domain.
  return { ...rest, id: _id } as unknown as T;
}
