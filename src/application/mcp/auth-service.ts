import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import type { AccountRepository, PublicationRepository } from "../ports";
import type { McpRepository } from "./ports";
import {
  clientSchema,
  settingsSchema,
  scopeSchema,
  MCP_SCOPE,
  type McpGrant,
  type McpClient,
  type AuthorizationRequest,
} from "@/domain/mcp/models";
import type { AuditEvent, User } from "@/domain/models";
import { ensure } from "@/domain/errors";

export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
export const pkce = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
export function matches(value: string, digest: string) {
  const actual = Buffer.from(hash(value));
  const expected = Buffer.from(digest);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function assertAdmin(user: User) {
  ensure(
    user.role === "admin" && user.status === "active",
    "FORBIDDEN",
    "Only administrators can configure MCP.",
    403,
  );
}
const uuid = z.string().uuid();
export function tokenId(token: string, kind: "access" | "refresh") {
  const parts = token.split(".");
  ensure(
    parts.length === 3 &&
      parts[0] === `astra_${kind}` &&
      uuid.safeParse(parts[1]).success &&
      /^[A-Za-z0-9_-]{43}$/.test(parts[2] ?? ""),
    "invalid_token",
    "Invalid credential.",
    401,
  );
  return parts[1]!;
}
export class McpAuthService {
  constructor(
    readonly repository: McpRepository,
    private readonly accounts: AccountRepository,
    readonly resource: string,
    private readonly publications: Pick<PublicationRepository, "mcpSelectable">,
  ) {}
  audit(
    user: User,
    action: string,
    targetId: string,
    details: string,
  ): AuditEvent {
    return {
      id: randomUUID(),
      actorId: user.id,
      actorName: user.name,
      action,
      targetId,
      details,
      createdAt: new Date(),
    };
  }
  async enabled() {
    const settings = await this.repository.settings();
    ensure(
      settings.enabled,
      "MCP_DISABLED",
      "MCP access is disabled by the administrator.",
      403,
    );
    return settings;
  }
  async configure(user: User, input: unknown) {
    assertAdmin(user);
    const patch = settingsSchema.parse(input);
    const eligible = await this.publications.mcpSelectable(
      patch.allowedPublicationIds,
    );
    ensure(
      eligible.length === patch.allowedPublicationIds.length,
      "INVALID_SELECTION",
      "Only existing admin-created comics can be shared with MCP. Remove independent-author, deleted, or artwork IDs.",
    );
    await this.repository.updateSettings(
      patch,
      this.audit(
        user,
        "mcp.settings",
        "mcp",
        patch.enabled
          ? "MCP settings updated"
          : "MCP disabled and credentials invalidated",
      ),
    );
  }
  async register(input: unknown, admin?: User) {
    if (admin) assertAdmin(admin);
    else
      ensure(
        (await this.enabled()).registrationEnabled,
        "registration_not_supported",
        "Client registration is managed by an administrator.",
        403,
      );
    const data = clientSchema.parse(input);
    const clientSecret = data.confidential ? secret() : null;
    const client: McpClient = {
      id: randomUUID(),
      name: data.name,
      redirectUris: [...new Set(data.redirectUris)],
      secretHash: clientSecret ? hash(clientSecret) : null,
      // Registration identifies a client; admin consent is still required for access.
      status: "approved",
      revision: 1,
      createdAt: new Date(),
    };
    await this.repository.createClient(
      client,
      admin
        ? this.audit(admin, "mcp.client.created", client.id, client.name)
        : undefined,
    );
    return { client, clientSecret };
  }
  async clientStatus(user: User, id: string, status: "approved" | "revoked") {
    assertAdmin(user);
    ensure(
      await this.repository.client(id),
      "NOT_FOUND",
      "Client not found.",
      404,
    );
    await this.repository.setClientStatus(
      id,
      status,
      this.audit(
        user,
        `mcp.client.${status}`,
        id,
        "Client authorization updated; existing connections invalidated",
      ),
    );
  }
  async approvedClient(id: string) {
    const client = await this.repository.client(id);
    ensure(
      client?.status === "approved",
      "unauthorized_client",
      "This OAuth client needs administrator approval or has been revoked.",
      403,
    );
    return client;
  }
  async activeUser(id: string) {
    const user = await this.accounts.findUser(id);
    ensure(
      user?.status === "active",
      "invalid_grant",
      "Account is unavailable.",
      401,
    );
    assertAdmin(user);
    return user;
  }
  async authorization(query: URLSearchParams) {
    await this.enabled();
    const value = z
      .object({
        response_type: z.literal("code"),
        client_id: uuid,
        redirect_uri: z.string().max(2048),
        code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        code_challenge_method: z.literal("S256"),
        resource: z.literal(this.resource),
        scope: scopeSchema,
        state: z.string().max(2048).default(""),
      })
      .parse(Object.fromEntries(query));
    const client = await this.approvedClient(value.client_id);
    ensure(
      client.redirectUris.includes(value.redirect_uri),
      "invalid_request",
      "Callback does not exactly match an approved callback.",
    );
    const request: AuthorizationRequest = {
      clientId: client.id,
      redirectUri: value.redirect_uri,
      challenge: value.code_challenge,
      state: value.state,
      resource: this.resource,
      scope: value.scope,
    };
    return { request, client };
  }
  async consent(user: User, query: URLSearchParams) {
    assertAdmin(user);
    const { request, client } = await this.authorization(query);
    const settings = await this.enabled();
    await this.activeUser(user.id);
    if (request.scope.includes("comics:preview")) {
      assertAdmin(user);
      ensure(
        settings.previewEnabled,
        "invalid_scope",
        "Draft preview disabled.",
        403,
      );
    }
    if (request.scope.includes("comics:annotate")) {
      assertAdmin(user);
      ensure(
        settings.annotationsEnabled,
        "invalid_scope",
        "Image annotation is disabled.",
        403,
      );
    }
    const ticket = secret();
    await this.repository.createTicket({
      ...request,
      id: hash(ticket),
      kind: "consent",
      userId: user.id,
      clientRevision: client.revision,
      generation: settings.generation,
      grantId: null,
      expiresAt: new Date(Date.now() + 300_000),
      consumedAt: null,
    });
    return { ticket, client, scope: request.scope };
  }
  async approve(user: User, rawTicket: string, allow: boolean) {
    const settings = await this.enabled();
    const ticket = await this.repository.ticket(hash(rawTicket));
    ensure(
      ticket?.kind === "consent",
      "invalid_request",
      "Consent request is missing or no longer available. Restart the connection from your AI application.",
    );
    ensure(
      // Imported accounts can retain BSON IDs. Separate Mongo reads produce
      // different objects for the same ID; compare values, preserving ID type
      // so a string ID cannot impersonate an ObjectId with the same text.
      ticket.userId != null &&
        user.id != null &&
        typeof ticket.userId === typeof user.id &&
        String(ticket.userId) === String(user.id),
      "invalid_request",
      "The signed-in account changed. Restart the connection with the same administrator account.",
    );
    ensure(
      !ticket.consumedAt,
      "invalid_request",
      "Consent already used. Restart the connection from your AI application.",
    );
    ensure(
      ticket.expiresAt > new Date(),
      "invalid_request",
      "Consent expired. Restart the connection from your AI application.",
    );
    ensure(
      ticket.generation === settings.generation,
      "invalid_request",
      "Connection settings changed. Restart the connection from your AI application.",
    );
    const client = await this.approvedClient(ticket.clientId);
    ensure(
      client.revision === ticket.clientRevision,
      "invalid_request",
      "Client configuration changed. Restart the connection.",
    );
    await this.activeUser(user.id);
    if (ticket.scope.includes("comics:preview")) {
      assertAdmin(user);
      ensure(
        settings.previewEnabled,
        "invalid_scope",
        "Draft preview disabled.",
        403,
      );
    }
    if (ticket.scope.includes("comics:annotate")) {
      assertAdmin(user);
      ensure(
        settings.annotationsEnabled,
        "invalid_scope",
        "Annotation disabled.",
        403,
      );
    }
    ensure(
      await this.repository.consumeTicket(ticket.id),
      "invalid_request",
      "Consent already used.",
    );
    const destination = new URL(ticket.redirectUri);
    if (ticket.state) destination.searchParams.set("state", ticket.state);
    if (!allow) {
      destination.searchParams.set("error", "access_denied");
      return destination.toString();
    }
    const code = secret();
    await this.repository.createTicket({
      ...ticket,
      id: hash(code),
      kind: "code",
      grantId: randomUUID(),
      consumedAt: null,
      expiresAt: new Date(Date.now() + 300_000),
    });
    destination.searchParams.set("code", code);
    return destination.toString();
  }
  private credentials(id: string, expiry: Date) {
    const access = `astra_access.${id}.${secret()}`;
    const refresh = `astra_refresh.${id}.${secret()}`;
    const accessExpiresAt = new Date(
      Math.min(Date.now() + 3600_000, expiry.getTime()),
    );
    return {
      access,
      refresh,
      patch: {
        accessHash: hash(access),
        refreshHash: hash(refresh),
        accessExpiresAt,
      },
    };
  }
  private response(
    values: ReturnType<McpAuthService["credentials"]>,
    scope: string,
  ) {
    return {
      access_token: values.access,
      refresh_token: values.refresh,
      token_type: "Bearer",
      expires_in: Math.max(
        0,
        Math.floor(
          (values.patch.accessExpiresAt.getTime() - Date.now()) / 1000,
        ),
      ),
      scope,
    };
  }
  async exchange(input: URLSearchParams) {
    const settings = await this.enabled();
    const client = await this.approvedClient(
      uuid.parse(input.get("client_id")),
    );
    if (client.secretHash)
      ensure(
        matches(input.get("client_secret") ?? "", client.secretHash),
        "invalid_client",
        "Invalid client credentials.",
        401,
      );
    ensure(
      input.get("resource") === this.resource,
      "invalid_target",
      "The resource must be this MCP endpoint.",
    );
    if (input.get("grant_type") === "authorization_code") {
      const ticket = await this.repository.ticket(
        hash(z.string().min(20).max(200).parse(input.get("code"))),
      );
      ensure(
        ticket?.kind === "code" &&
          ticket.grantId &&
          ticket.clientId === client.id &&
          ticket.clientRevision === client.revision &&
          ticket.generation === settings.generation &&
          ticket.expiresAt > new Date(),
        "invalid_grant",
        "Invalid or expired authorization code.",
      );
      const verifier = z
        .string()
        .regex(/^[A-Za-z0-9._~-]{43,128}$/)
        .parse(input.get("code_verifier"));
      ensure(
        pkce(verifier) === ticket.challenge &&
          input.get("redirect_uri") === ticket.redirectUri,
        "invalid_grant",
        "Invalid PKCE proof or callback.",
      );
      const user = await this.activeUser(ticket.userId);
      if (ticket.scope.includes("comics:preview")) {
        assertAdmin(user);
        ensure(
          settings.previewEnabled,
          "invalid_scope",
          "Draft preview disabled.",
          403,
        );
      }
      if (ticket.scope.includes("comics:annotate")) {
        assertAdmin(user);
        ensure(
          settings.annotationsEnabled,
          "invalid_scope",
          "Annotation disabled.",
          403,
        );
      }
      const expiresAt = new Date(Date.now() + 30 * 86400_000);
      const values = this.credentials(ticket.grantId, expiresAt);
      const redeemed = await this.repository.redeemCode(
        ticket.id,
        {
          id: ticket.grantId,
          name: client.name,
          userId: user.id,
          clientId: client.id,
          clientRevision: client.revision,
          generation: settings.generation,
          resource: this.resource,
          scope: ticket.scope,
          kind: "oauth",
          ...values.patch,
          usedRefreshHashes: [],
          expiresAt,
          revokedAt: null,
          createdAt: new Date(),
        },
        this.audit(user, "mcp.oauth.connected", ticket.grantId, client.name),
      );
      ensure(
        redeemed,
        "invalid_grant",
        "Authorization code already used. Reconnect.",
      );
      return this.response(values, ticket.scope);
    }
    ensure(
      input.get("grant_type") === "refresh_token",
      "unsupported_grant_type",
      "Use authorization_code or refresh_token.",
    );
    const raw = z.string().max(200).parse(input.get("refresh_token"));
    const grant = await this.repository.grant(tokenId(raw, "refresh"));
    ensure(
      grant && grant.clientId === client.id && grant.kind === "oauth",
      "invalid_grant",
      "Invalid refresh token.",
    );
    await this.validateGrant(grant);
    if (grant.usedRefreshHashes.includes(hash(raw))) {
      await this.repository.revokeGrant(grant.id);
      ensure(
        false,
        "invalid_grant",
        "Refresh token reuse detected. Reconnect.",
      );
    }
    ensure(
      grant.refreshHash && matches(raw, grant.refreshHash),
      "invalid_grant",
      "Invalid refresh token.",
    );
    ensure(
      grant.usedRefreshHashes.length < 1000,
      "invalid_grant",
      "Connection must be renewed.",
    );
    const values = this.credentials(grant.id, grant.expiresAt);
    if (
      !(await this.repository.rotateGrant(
        grant.id,
        grant.refreshHash,
        values.patch,
      ))
    ) {
      await this.repository.revokeGrant(grant.id);
      ensure(false, "invalid_grant", "Refresh token already used. Reconnect.");
    }
    return this.response(values, grant.scope);
  }
  private async validateGrant(grant: McpGrant) {
    const settings = await this.enabled();
    ensure(
      !grant.revokedAt &&
        grant.expiresAt > new Date() &&
        grant.generation === settings.generation &&
        grant.resource === this.resource,
      "invalid_token",
      "Connection revoked or expired.",
      401,
    );
    if (grant.clientId) {
      const client = await this.approvedClient(grant.clientId);
      ensure(
        client.revision === grant.clientRevision,
        "invalid_token",
        "Client access has changed.",
        401,
      );
    }
    const user = await this.activeUser(grant.userId);
    if (grant.scope.includes("comics:preview")) {
      assertAdmin(user);
      ensure(
        settings.previewEnabled,
        "invalid_scope",
        "Draft preview disabled.",
        403,
      );
    }
    if (grant.scope.includes("comics:annotate")) {
      assertAdmin(user);
      ensure(
        settings.annotationsEnabled,
        "invalid_scope",
        "Annotation disabled.",
        403,
      );
    }
    return user;
  }
  async authenticate(token: string) {
    const grant = await this.repository.grant(tokenId(token, "access"));
    ensure(
      grant &&
        matches(token, grant.accessHash) &&
        grant.accessExpiresAt > new Date(),
      "invalid_token",
      "Invalid or expired access token.",
      401,
    );
    const user = await this.validateGrant(grant);
    return { user, grant };
  }
  async issueToken(
    admin: User,
    input: {
      name: string;
      email: string;
      days: number;
      annotate: boolean;
      preview?: boolean;
    },
  ) {
    assertAdmin(admin);
    const settings = await this.enabled();
    const account = await this.accounts.findByEmail(input.email.toLowerCase());
    ensure(
      account?.status === "active",
      "NOT_FOUND",
      "Choose an existing active admin account.",
      404,
    );
    assertAdmin(account);
    ensure(
      Number.isInteger(input.days) && input.days >= 1 && input.days <= 365,
      "INVALID_EXPIRY",
      "Choose 1 to 365 days.",
    );
    if (input.preview) {
      assertAdmin(account);
      ensure(
        settings.previewEnabled,
        "invalid_scope",
        "Enable draft preview first.",
        403,
      );
    }
    if (input.annotate) {
      assertAdmin(account);
      ensure(
        settings.annotationsEnabled,
        "invalid_scope",
        "Enable annotation first.",
        403,
      );
    }
    const id = randomUUID();
    const token = `astra_access.${id}.${secret()}`;
    const expiresAt = new Date(Date.now() + input.days * 86400_000);
    await this.repository.createGrant(
      {
        id,
        name: input.name,
        userId: account.id,
        clientId: null,
        clientRevision: 0,
        generation: settings.generation,
        resource: this.resource,
        scope: [
          MCP_SCOPE,
          ...(input.annotate ? ["comics:annotate"] : []),
          ...(input.preview ? ["comics:preview"] : []),
        ].join(" "),
        kind: "token",
        accessHash: hash(token),
        accessExpiresAt: expiresAt,
        refreshHash: null,
        usedRefreshHashes: [],
        expiresAt,
        revokedAt: null,
        createdAt: new Date(),
      },
      this.audit(
        admin,
        "mcp.token.created",
        id,
        `${input.name}; account ${account.id}; ${input.days} days; annotation ${input.annotate}`,
      ),
    );
    return { token, id, expiresAt };
  }
  async revoke(admin: User, id: string) {
    assertAdmin(admin);
    await this.repository.revokeGrant(
      id,
      this.audit(
        admin,
        "mcp.connection.revoked",
        id,
        "Connection revoked by administrator",
      ),
    );
  }
  async revokeToken(raw: string, clientId: string, clientSecret: string) {
    const client = await this.approvedClient(clientId);
    if (client.secretHash)
      ensure(
        matches(clientSecret, client.secretHash),
        "invalid_client",
        "Invalid client credentials.",
        401,
      );
    let id: string;
    try {
      id = tokenId(
        raw,
        raw.startsWith("astra_refresh.") ? "refresh" : "access",
      );
    } catch {
      return;
    }
    const grant = await this.repository.grant(id);
    if (
      grant?.clientId === clientId &&
      (matches(raw, grant.accessHash) ||
        (grant.refreshHash && matches(raw, grant.refreshHash)) ||
        grant.usedRefreshHashes.includes(hash(raw)))
    )
      await this.repository.revokeGrant(id);
  }
}
