export type Role = "reader" | "author" | "admin";
export type AccessModel = "free" | "membership" | "purchase" | "both";
export type PublicationStatus =
  | "draft"
  | "submitted"
  | "changes_requested"
  | "published"
  | "rejected"
  | "hidden";
export type PublicationKind = "comic" | "artwork";
export const genres = [
  "Fantasy",
  "Sci-fi",
  "Action",
  "Adventure",
  "Slice of life",
  "Mystery",
] as const;
export type Genre = (typeof genres)[number];
export type AgeRating = "everyone" | "teen" | "mature";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "suspended";
  createdAt: Date;
}
export interface Account extends User {
  passwordHash: string;
}
export interface Session {
  audience: import("./service").ServiceId;
  id: string;
  userId: string;
  expiresAt: Date;
}
export interface Publication {
  id: string;
  slug: string;
  authorId: string;
  authorName: string;
  title: string;
  synopsis: string;
  genre: Genre;
  kind: PublicationKind;
  access: AccessModel;
  ageRating: AgeRating;
  tags?: string[];
  pricePaise?: number | null;
  previewText?: string;
  chapters?: Chapter[];
  // Published by the platform itself (created by an administrator), as opposed to an independent creator.
  original?: boolean;
  // A new chapter being prepared for an already-published comic. Its pages are stored after
  // `pageCount` and stay invisible to readers until an administrator approves the release.
  release?: ChapterRelease | null;
  rightsConfirmed: boolean;
  status: PublicationStatus;
  coverKey: string | null;
  pageCount: number;
  version: number;
  feedback: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}
export interface ChapterRelease {
  id: string;
  title: string;
  status: "draft" | "submitted" | "changes_requested";
  pageCount: number;
  feedback: string | null;
  createdAt: Date;
  updatedAt: Date;
}
// A reader comment on one chapter; comics without chapters use the single thread "comic".
export interface ChapterComment {
  id: string;
  comicId: string;
  chapterId: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: Date;
}
export interface Chapter {
  id: string;
  title: string;
  startPage: number;
}
export interface ComicPage {
  id: string;
  comicId: string;
  number: number;
  storageKey: string;
  alt: string;
  bytes: number;
  storyText?: string;
}
export interface Entitlement {
  id: string;
  userId: string;
  kind: "membership" | "purchase";
  comicId: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}
export interface CatalogQuery {
  genre?: Genre;
  access?: AccessModel;
  search?: string;
  cursor?: string;
  limit: number;
  kind: PublicationKind;
  original?: boolean;
}
export interface Slice<T> {
  items: T[];
  nextCursor: string | null;
}
export interface ReadingProgress {
  userId: string;
  comicId: string;
  page: number;
  updatedAt: Date;
}
export interface AuditEvent {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetId: string;
  details: string;
  createdAt: Date;
}
export interface ReaderReport {
  id: string;
  reporterId: string;
  comicId: string;
  title: string;
  reason: string;
  status: "open" | "resolved";
  createdAt: Date;
  resolvedAt: Date | null;
}
export interface PlatformPolicy {
  id: "platform";
  adsEnabled: boolean;
  submissionsEnabled: boolean;
  siteName: string;
  updatedAt: Date;
}
export interface LibraryItem {
  publication: Publication;
  page: number | null;
  saved: boolean;
}
export interface DashboardMetrics {
  published: number;
  drafts: number;
  submitted: number;
  readers: number;
  followers: number;
}
export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  size?: number;
}
export interface AccessDecision {
  allowed: boolean;
  reason:
    | "preview"
    | "free"
    | "membership"
    | "purchase"
    | "login_required"
    | "payment_required"
    | "unavailable";
}
