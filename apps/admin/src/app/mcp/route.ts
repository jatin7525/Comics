import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ensure } from "@/domain/errors";
import { createComicMcp } from "@/server/mcp/protocol";
import { mcpServices } from "@/server/mcp/services";
import { boundary, publicLimit } from "@/server/mcp/http";
import { boundedBody } from "@/server/http";
import { getServices } from "@/server/services";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = (request: Request) =>
  boundary(request, async () => {
    const { auth, reading } = mcpServices();
    await auth.enabled();
    const header = request.headers.get("authorization");
    ensure(
      header && header.startsWith("Bearer ") && header.length < 256,
      "invalid_token",
      "Use an OAuth or admin-issued Bearer token.",
      401,
    );
    let principal;
    try {
      principal = await auth.authenticate(header.slice(7));
    } catch (error) {
      await publicLimit("invalid-token");
      throw error;
    }
    await getServices().limiter.consume(
      `mcp:reader:${principal.user.id}`,
      120,
      60,
    );
    ensure(
      request.headers.get("content-type")?.includes("application/json"),
      "invalid_request",
      "Send application/json.",
      415,
    );
    const bytes = await boundedBody(request, 32_768);
    let body: unknown;
    try {
      body = JSON.parse(Buffer.from(bytes).toString("utf8"));
    } catch {
      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error" },
          id: null,
        },
        { status: 400 },
      );
    }
    // One call per request keeps rate limits and response bounds meaningful; MCP does not require batches.
    ensure(
      !Array.isArray(body),
      "invalid_request",
      "Batch requests are not supported.",
    );
    const server = createComicMcp(
      reading,
      principal.user,
      principal.grant.scope.includes("comics:annotate"),
      principal.grant.scope.includes("comics:preview"),
    );
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      return await transport.handleRequest(request, { parsedBody: body });
    } finally {
      await server.close();
    }
  });
export const GET = (request: Request) =>
  boundary(request, async () => {
    const header = request.headers.get("authorization");
    ensure(
      header && header.startsWith("Bearer "),
      "invalid_token",
      "Authentication required.",
      401,
    );
    await mcpServices().auth.authenticate(header.slice(7));
    return new Response(null, {
      status: 405,
      headers: { Allow: "POST, OPTIONS" },
    });
  });
export const DELETE = GET;
export { options as OPTIONS } from "@/server/mcp/http";
