import { z } from "zod";

export const MCP_SCOPE = "comics:read";
export interface McpSettings {
  enabled: boolean;
  registrationEnabled: boolean;
  annotationsEnabled: boolean;
  previewEnabled: boolean;
  allowedOrigins: string[];
  /** Legacy field retained for compatibility; MCP includes all admin comics. */
  allowedPublicationIds: string[];
  generation: number;
}
export const defaultMcpSettings: McpSettings = {
  enabled: false,
  registrationEnabled: false,
  annotationsEnabled: false,
  previewEnabled: false,
  allowedOrigins: [],
  allowedPublicationIds: [],
  generation: 0,
};
export function safeRedirect(value: string) {
  try {
    const url = new URL(value);
    return (
      !url.hash &&
      !url.username &&
      !url.password &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}
export const redirectSchema = z
  .string()
  .max(2048)
  .refine(
    safeRedirect,
    "Use an HTTPS callback or an HTTP loopback callback, without credentials or fragments.",
  );
export const clientSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    redirectUris: z.array(redirectSchema).min(1).max(10),
    confidential: z.boolean().default(false),
  })
  .strict();
export const settingsSchema = z
  .object({
    enabled: z.boolean(),
    registrationEnabled: z.boolean(),
    annotationsEnabled: z.boolean(),
    previewEnabled: z.boolean(),
    allowedPublicationIds: z
      .array(z.string().uuid())
      .max(500)
      .transform(() => [] as string[])
      .default([]),
    allowedOrigins: z
      .array(
        z
          .string()
          .max(300)
          .refine((value) => {
            try {
              return safeRedirect(value) && new URL(value).origin === value;
            } catch {
              return false;
            }
          }, "Enter an exact HTTPS origin (or local loopback origin), without a trailing slash."),
      )
      .max(20),
  })
  .strict();
export interface McpClient {
  id: string;
  name: string;
  redirectUris: string[];
  secretHash: string | null;
  status: "pending" | "approved" | "revoked";
  revision: number;
  createdAt: Date;
}
export interface McpGrant {
  id: string;
  name: string;
  userId: string;
  clientId: string | null;
  clientRevision: number;
  generation: number;
  resource: string;
  scope: string;
  kind: "oauth" | "token";
  accessHash: string;
  accessExpiresAt: Date;
  refreshHash: string | null;
  usedRefreshHashes: string[];
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}
export interface AuthorizationRequest {
  scope: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
  resource: string;
}
export interface McpTicket extends AuthorizationRequest {
  id: string;
  kind: "consent" | "code";
  userId: string;
  clientRevision: number;
  generation: number;
  grantId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
}

// OAuth lets a server grant fewer scopes than requested, so unknown scopes are ignored rather than
// rejected (clients differ: some request every advertised scope, others add generic ones).
// comics:read is always granted; optional scopes are kept only when requested.
export const scopeSchema = z
  .string()
  .max(1000)
  .default(MCP_SCOPE)
  .transform((value) => {
    const requested = value.split(/\s+/);
    return [MCP_SCOPE, "comics:annotate", "comics:preview"]
      .filter((scope) => scope === MCP_SCOPE || requested.includes(scope))
      .join(" ");
  });
