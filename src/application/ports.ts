import type {
  Account,
  AuditEvent,
  CatalogQuery,
  Chapter,
  ComicPage,
  DashboardMetrics,
  Entitlement,
  LibraryItem,
  PlatformPolicy,
  Publication,
  ReaderReport,
  Session,
  Slice,
  StoredObject,
  User,
} from "@/domain/models";

export interface AccountRepository {
  findByEmail(email: string): Promise<Account | null>;
  findUser(id: string): Promise<User | null>;
  create(account: Account): Promise<void>;
  createSession(session: Session): Promise<void>;
  findSession(hash: string): Promise<Session | null>;
  deleteSession(hash: string): Promise<void>;
}
export interface PublicationRepository {
  catalog(query: CatalogQuery): Promise<Slice<Publication>>;
  find(id: string): Promise<Publication | null>;
  findBySlug(slug: string): Promise<Publication | null>;
  byAuthor(authorId: string): Promise<Publication[]>;
  create(publication: Publication): Promise<void>;
  update(
    id: string,
    expectedVersion: number,
    allowedStatuses: Publication["status"][],
    patch: Partial<Publication>,
    audit?: AuditEvent,
  ): Promise<boolean>;
  page(comicId: string, number: number): Promise<ComicPage | null>;
  pages(comicId: string): Promise<ComicPage[]>;
  pageRange(comicId: string, from: number, to: number): Promise<ComicPage[]>;
  reorderPages(id: string, version: number, ids: string[]): Promise<boolean>;
  restructure(
    id: string,
    version: number,
    change: (current: {
      publication: Publication;
      pages: ComicPage[];
    }) => { pages: ComicPage[]; chapters: Chapter[] } | null,
    audit?: AuditEvent,
  ): Promise<boolean>;
  // Returns the replaced image's storage key, or null on conflict.
  replacePageImage(
    id: string,
    version: number,
    pageId: string,
    storageKey: string,
    bytes: number,
    audit: AuditEvent,
  ): Promise<string | null>;
  // Permanently removes the publication and its pages; returns storage keys to delete, or null on conflict.
  deletePublication(
    id: string,
    version: number,
    audit: AuditEvent,
  ): Promise<string[] | null>;
  editPage(
    id: string,
    version: number,
    pageId: string,
    alt: string,
    storyText: string,
  ): Promise<boolean>;
  related(publication: Publication): Promise<Publication[]>;
  addPage(publication: Publication, page: ComicPage): Promise<boolean>;
  addReleasePage(publication: Publication, page: ComicPage): Promise<boolean>;
  // Deletes the unreleased pages and clears the release; returns their storage keys, or null on conflict.
  discardRelease(id: string, version: number): Promise<string[] | null>;
  approveRelease(
    id: string,
    version: number,
    chapters: Chapter[],
    audit: AuditEvent,
  ): Promise<boolean>;
}
export interface EntitlementRepository {
  forReader(userId: string, comicId: string): Promise<Entitlement[]>;
}
export interface ObjectStorage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}
export interface CommunityRepository {
  library(userId: string, history: boolean): Promise<LibraryItem[]>;
  isSaved(userId: string, comicId: string): Promise<boolean>;
  save(userId: string, comicId: string, enabled: boolean): Promise<void>;
  recordProgress(userId: string, comicId: string, page: number): Promise<void>;
  follow(userId: string, authorId: string, enabled: boolean): Promise<void>;
  isFollowing(userId: string, authorId: string): Promise<boolean>;
  feed(userId: string): Promise<Publication[]>;
  report(report: ReaderReport): Promise<void>;
  metrics(authorId?: string): Promise<DashboardMetrics>;
}
export interface AdministrationRepository {
  reviewQueue(): Promise<Publication[]>;
  releaseQueue(): Promise<Publication[]>;
  content(): Promise<Publication[]>;
  users(): Promise<User[]>;
  audit(): Promise<AuditEvent[]>;
  reports(): Promise<ReaderReport[]>;
  policy(): Promise<PlatformPolicy>;
  updatePolicy(
    patch: Pick<PlatformPolicy, "adsEnabled" | "submissionsEnabled"> &
      Partial<Pick<PlatformPolicy, "siteName">>,
    audit: AuditEvent,
  ): Promise<void>;
  updateUser(
    id: string,
    patch: Pick<User, "role" | "status">,
    audit: AuditEvent,
  ): Promise<void>;
  resolveReport(id: string, audit: AuditEvent): Promise<boolean>;
}
export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<void>;
}
