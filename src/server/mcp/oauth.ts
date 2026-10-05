import "server-only";
import { z } from "zod";
import { ensure } from "@/domain/errors";
import { redirectSchema, scopeSchema, MCP_SCOPE } from "@/domain/mcp/models";
import { boundary, formInput, json, publicLimit } from "./http";
import { mcpServices } from "./services";
import { jsonInput } from "../http";

function publicMetadata(value: unknown) {
  const response = json(value);
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
}
export const protectedMetadata = () => {
  const { origin, resource } = mcpServices();
  return publicMetadata({
    resource,
    authorization_servers: [origin],
    scopes_supported: [MCP_SCOPE, "comics:annotate", "comics:preview"],
    bearer_methods_supported: ["header"],
    resource_name: "Comic platform MCP",
  });
};
export async function authorizationMetadata() {
  const { origin, repository } = mcpServices();
  const settings = await repository.settings();
  return publicMetadata({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    ...(settings.registrationEnabled
      ? { registration_endpoint: `${origin}/oauth/register` }
      : {}),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    scopes_supported: [MCP_SCOPE, "comics:annotate", "comics:preview"],
    client_id_metadata_document_supported: false,
  });
}
function clientAuthentication(request: Request, body: URLSearchParams) {
  const header = request.headers.get("authorization");
  if (!header) return;
  ensure(
    header.startsWith("Basic ") && !body.has("client_secret"),
    "invalid_client",
    "Use a single client authentication method.",
    401,
  );
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const split = decoded.indexOf(":");
  ensure(split > 0, "invalid_client", "Invalid Basic credentials.", 401);
  let id: string, clientSecret: string;
  try {
    id = decodeURIComponent(decoded.slice(0, split));
    clientSecret = decodeURIComponent(decoded.slice(split + 1));
  } catch {
    ensure(false, "invalid_client", "Invalid Basic credentials.", 401);
  }
  ensure(
    !body.has("client_id") || body.get("client_id") === id,
    "invalid_client",
    "Client identity mismatch.",
    401,
  );
  body.set("client_id", id);
  body.set("client_secret", clientSecret!);
}
export const token = (request: Request) =>
  boundary(request, async () => {
    await publicLimit("token");
    const body = await formInput(request);
    clientAuthentication(request, body);
    return json(await mcpServices().auth.exchange(body));
  });
export const revoke = (request: Request) =>
  boundary(request, async () => {
    await publicLimit("revoke");
    const body = await formInput(request);
    clientAuthentication(request, body);
    await mcpServices().auth.revokeToken(
      z.string().max(200).parse(body.get("token")),
      z.string().uuid().parse(body.get("client_id")),
      body.get("client_secret") ?? "",
    );
    return json({});
  });
export const register = (request: Request) =>
  boundary(request, async () => {
    await publicLimit("register");
    const input = await jsonInput(
      request,
      z.object({
        client_name: z.string().trim().min(2).max(100),
        redirect_uris: z.array(redirectSchema).min(1).max(10),
        token_endpoint_auth_method: z
          .enum(["none", "client_secret_post", "client_secret_basic"])
          .default("none"),
        grant_types: z
          .array(z.enum(["authorization_code", "refresh_token"]))
          .optional(),
        response_types: z.array(z.literal("code")).optional(),
        scope: scopeSchema.optional(),
      }),
    );
    const { client, clientSecret } = await mcpServices().auth.register({
      name: input.client_name,
      redirectUris: input.redirect_uris,
      confidential: input.token_endpoint_auth_method !== "none",
    });
    return json(
      {
        client_id: client.id,
        client_name: client.name,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: input.token_endpoint_auth_method,
        ...(clientSecret
          ? { client_secret: clientSecret, client_secret_expires_at: 0 }
          : {}),
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: input.scope ?? MCP_SCOPE,
        approval_status: "pending",
        approval_message:
          "An administrator must approve this client before authorization. Reuse this client_id after approval.",
      },
      201,
    );
  });
