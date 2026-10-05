import type { AuditEvent } from "@/domain/models";
import type {
  McpSettings,
  McpClient,
  McpGrant,
  McpTicket,
} from "@/domain/mcp/models";
export interface McpRepository {
  settings(): Promise<McpSettings>;
  updateSettings(
    patch: Omit<McpSettings, "generation">,
    audit: AuditEvent,
  ): Promise<void>;
  clients(): Promise<McpClient[]>;
  client(id: string): Promise<McpClient | null>;
  createClient(client: McpClient, audit?: AuditEvent): Promise<void>;
  setClientStatus(
    id: string,
    status: "approved" | "revoked",
    audit: AuditEvent,
  ): Promise<void>;
  grants(userId?: string): Promise<McpGrant[]>;
  grant(id: string): Promise<McpGrant | null>;
  createGrant(grant: McpGrant, audit?: AuditEvent): Promise<void>;
  revokeGrant(id: string, audit?: AuditEvent): Promise<void>;
  rotateGrant(
    id: string,
    expectedHash: string,
    patch: Pick<McpGrant, "accessHash" | "accessExpiresAt" | "refreshHash">,
  ): Promise<boolean>;
  createTicket(ticket: McpTicket): Promise<void>;
  ticket(id: string): Promise<McpTicket | null>;
  consumeTicket(id: string): Promise<boolean>;
  redeemCode(
    ticketId: string,
    grant: McpGrant,
    audit: AuditEvent,
  ): Promise<boolean>;
}
