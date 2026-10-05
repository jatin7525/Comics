import { redirect } from "next/navigation";
import { currentUser } from "@/server/session";
import { mcpServices } from "@/server/mcp/services";
import { AppError } from "@/domain/errors";
import { ZodError } from "zod";
import { getServices } from "@/server/services";
export default async function Authorize({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value))
      return (
        <section className="panel">
          <h1>Invalid authorization request</h1>
          <p>Duplicate parameters are not supported.</p>
        </section>
      );
    if (value) query.set(key, value);
  }
  const user = await currentUser();
  if (!user)
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  let consent;
  try {
    await getServices().limiter.consume(`mcp:consent:${user.id}`, 30, 60);
    consent = await mcpServices().auth.consent(user, query);
  } catch (error) {
    return (
      <section className="panel">
        <h1>Connection unavailable</h1>
        <p>
          {error instanceof AppError
            ? error.message
            : error instanceof ZodError
              ? "The authorization request is invalid. Ask the client to reconnect with PKCE and the MCP resource URL."
              : "Please try again later."}
        </p>
      </section>
    );
  }
  const preview = consent.scope.includes("comics:preview");
  const annotate = consent.scope.includes("comics:annotate");
  return (
    <section className="panel" style={{ maxWidth: 640, margin: "40px auto" }}>
      <span className="tag">
        AI connection · {annotate ? "Image tagging available" : "Read only"}
      </span>
      <h1>Connect {consent.client.name}?</h1>
      <p>
        Signed in as {user.email}. This client can read all admin-created comics
        automatically. Your account must remain an active administrator.
      </p>
      <p>
        It cannot upload, publish, delete, buy comics, comment, or change your
        account.
      </p>
      <p>
        The connection lasts up to 30 days. An administrator can revoke it at
        any time. Only continue if you trust this client with the comic content.
      </p>
      {(annotate || preview) && (
        <p>
          Reading is always included. Untick anything you don’t want to grant.
        </p>
      )}
      <p className="muted">
        Callback: {new URL(query.get("redirect_uri")!).origin}
      </p>
      <form action="/oauth/consent" method="post">
        <input type="hidden" name="ticket" value={consent.ticket} />
        <input type="hidden" name="choose" value="1" />
        {annotate && (
          <label className="consent-scope">
            <input type="checkbox" name="comics:annotate" defaultChecked />
            <span>
              <strong>Image tagging.</strong> Update per-image character tags,
              visual tags and descriptions. These changes are recorded in the
              admin audit log.
            </span>
          </label>
        )}
        {preview && (
          <label className="consent-scope">
            <input type="checkbox" name="comics:preview" defaultChecked />
            <span>
              <strong>Draft preview.</strong> Admin access to private drafts and
              unpublished chapter images and text.
            </span>
          </label>
        )}
        <button className="primary" name="decision" value="allow">
          Allow
        </button>{" "}
        <button className="secondary" name="decision" value="deny">
          Cancel
        </button>
      </form>
    </section>
  );
}
