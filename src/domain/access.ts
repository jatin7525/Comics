import type { AccessDecision, Entitlement, Publication, User } from "./models";

export const PREVIEW_PAGES = 4;
export function canManagePublication(
  actor: User,
  publication: Publication,
): boolean {
  return (
    actor.status === "active" &&
    (actor.role === "admin" ||
      (actor.role === "author" && actor.id === publication.authorId))
  );
}
export function readingAccess(
  publication: Publication,
  page: number,
  user: User | null,
  grants: Entitlement[],
  now = new Date(),
): AccessDecision {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > publication.pageCount ||
    publication.kind !== "comic"
  )
    return { allowed: false, reason: "unavailable" };
  if (user?.status === "suspended")
    return { allowed: false, reason: "unavailable" };
  if (publication.status !== "published")
    return { allowed: false, reason: "unavailable" };
  if (page <= PREVIEW_PAGES) return { allowed: true, reason: "preview" };
  if (!user) return { allowed: false, reason: "login_required" };
  if (publication.access === "free") return { allowed: true, reason: "free" };
  const active = grants.filter(
    (g) =>
      g.userId === user.id &&
      !g.revokedAt &&
      (!g.expiresAt || g.expiresAt > now),
  );
  if (
    ["purchase", "both"].includes(publication.access) &&
    active.some((g) => g.kind === "purchase" && g.comicId === publication.id)
  )
    return { allowed: true, reason: "purchase" };
  if (
    ["membership", "both"].includes(publication.access) &&
    active.some((g) => g.kind === "membership")
  )
    return { allowed: true, reason: "membership" };
  return { allowed: false, reason: "payment_required" };
}
