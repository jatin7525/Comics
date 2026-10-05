import "server-only";
import { AppError, ensure } from "@/domain/errors";
import { ZodError } from "zod";
import { boundedBody } from "../http";
import { getServices } from "../services";
import { mcpServices } from "./services";
import { serviceId } from "../service";

export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}
export async function cors(request: Request, response: Response) {
  const { repository, origin } = mcpServices();
  const allowed = [origin, ...(await repository.settings()).allowedOrigins];
  const incoming = request.headers.get("origin");
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Origin");
  if (incoming && allowed.includes(incoming)) {
    response.headers.set("Access-Control-Allow-Origin", incoming);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id",
    );
    response.headers.set(
      "Access-Control-Expose-Headers",
      "WWW-Authenticate, MCP-Protocol-Version",
    );
  }
  return response;
}
export async function guard(request: Request) {
  ensure(serviceId() === "admin", "NOT_FOUND", "Not found.", 404);
  const { origin, repository } = mcpServices();
  ensure(
    new URL(request.url).origin === origin,
    "INVALID_HOST",
    "Use the configured Admin origin.",
    403,
  );
  const incoming = request.headers.get("origin");
  const settings = await repository.settings();
  ensure(
    !incoming || [origin, ...settings.allowedOrigins].includes(incoming),
    "INVALID_ORIGIN",
    "Origin is not approved for MCP.",
    403,
  );
}
export async function boundary(
  request: Request,
  task: () => Promise<Response>,
) {
  try {
    await guard(request);
    return await cors(request, await task());
  } catch (error) {
    const known = error instanceof AppError;
    const response = json(
      {
        error: known
          ? error.code
          : error instanceof ZodError
            ? "invalid_request"
            : "server_error",
        error_description: known
          ? error.message
          : error instanceof ZodError
            ? "Invalid request parameters."
            : "Unable to process request.",
      },
      known ? error.status : error instanceof ZodError ? 400 : 500,
    );
    if (response.status === 401) {
      response.headers.set(
        "WWW-Authenticate",
        `Bearer resource_metadata="${mcpServices().origin}/.well-known/oauth-protected-resource/mcp", scope="comics:read"`,
      );
    }
    if (response.status === 429) response.headers.set("Retry-After", "60");
    return await cors(request, response).catch(() => response);
  }
}
export async function formInput(request: Request) {
  ensure(
    request.headers.get("content-type")?.split(";")[0] ===
      "application/x-www-form-urlencoded",
    "invalid_request",
    "Use application/x-www-form-urlencoded.",
    415,
  );
  const values = new URLSearchParams(
    Buffer.from(await boundedBody(request, 16_384)).toString("utf8"),
  );
  for (const key of new Set(values.keys()))
    ensure(
      values.getAll(key).length === 1,
      "invalid_request",
      "Duplicate parameters are not allowed.",
    );
  return values;
}
export async function publicLimit(scope: string) {
  // Global abuse budget intentionally avoids trusting spoofable forwarding headers.
  await getServices().limiter.consume(`mcp:public:${scope}`, 300, 60);
}
export const options = (request: Request) =>
  boundary(request, async () => new Response(null, { status: 204 }));
