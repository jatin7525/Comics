// The platform name is editable by administrators; this is only the fallback before one is saved.
export const DEFAULT_SITE_NAME = "Astra Comics";

// "Astra Comics" → { lead: "astra", rest: "COMICS" } for the two-tone logo wordmark.
export function brandParts(siteName: string) {
  const [lead = siteName, ...rest] = siteName.trim().split(/\s+/);
  return { lead: lead.toLowerCase(), rest: rest.join(" ").toUpperCase() };
}
