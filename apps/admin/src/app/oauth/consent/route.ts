import { currentUser } from "@/server/session";
import { mcpServices } from "@/server/mcp/services";
import { boundary, formInput } from "@/server/mcp/http";
import { ensure } from "@/domain/errors";
export const POST = (request: Request) =>
  boundary(request, async () => {
    ensure(
      request.headers.get("origin") === mcpServices().origin,
      "INVALID_ORIGIN",
      "Submit consent from the Admin site.",
      403,
    );
    const user = await currentUser();
    ensure(user, "UNAUTHENTICATED", "Sign in again.", 401);
    const body = await formInput(request);
    ensure(
      ["allow", "deny"].includes(body.get("decision") ?? ""),
      "invalid_request",
      "Choose allow or cancel.",
    );
    const destination = await mcpServices().auth.approve(
      user,
      body.get("ticket") ?? "",
      body.get("decision") === "allow",
    );
    return new Response(null, {
      status: 303,
      headers: { Location: destination, "Cache-Control": "no-store" },
    });
  });
