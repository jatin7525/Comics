"use client";
import { useState } from "react";
import type { McpSettings } from "@/domain/mcp/models";
import { requestJson, useMutation } from "./mutation";
interface Client {
  id: string;
  name: string;
  redirectUris: string[];
  confidential: boolean;
  status: string;
}
interface Grant {
  id: string;
  name: string;
  userId: string;
  kind: string;
  scope: string;
  expiresAt: string;
  revoked: boolean;
}
export function McpSettingsPanel({
  settings,
  endpoint,
  clients,
  grants,
}: {
  settings: McpSettings;
  endpoint: string;
  clients: Client[];
  grants: Grant[];
}) {
  const action = useMutation();
  const [credential, setCredential] = useState("");
  const submit = (body: unknown) =>
    action.run(async () => {
      await requestJson("/api/admin/mcp", body);
    }, "Connection settings saved.");
  return (
    <div className="mcp-admin">
      <section className="panel">
        <h2>Connect an AI client</h2>
        <p>Streamable HTTP endpoint</p>
        <code className="mcp-value">{endpoint}</code>
        <p>
          Use OAuth for clients with a sign-in flow, or an expiring Bearer token
          for clients that accept an Authorization header. Only active
          administrator accounts can connect. Only comics explicitly selected
          below are exposed; the public catalog is never browsable through MCP.
        </p>
      </section>
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          void submit({
            action: "settings",
            settings: {
              enabled: f.has("enabled"),
              registrationEnabled: f.has("registrationEnabled"),
              annotationsEnabled: f.has("annotationsEnabled"),
              previewEnabled: f.has("previewEnabled"),
              allowedPublicationIds: String(f.get("publicationIds") ?? "")
                .split(/\r?\n/)
                .map((v) => v.trim())
                .filter(Boolean),
              allowedOrigins: String(f.get("origins") ?? "")
                .split(/\r?\n/)
                .map((v) => v.trim())
                .filter(Boolean),
            },
          });
        }}
      >
        <h2>Access controls</h2>
        <fieldset disabled={action.pending}>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={settings.enabled}
            />
            Enable MCP connections
          </label>
          <p className="muted">
            Turning this off permanently invalidates existing tokens and OAuth
            connections. Administrators must reconnect after it is enabled
            again.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="registrationEnabled"
              defaultChecked={settings.registrationEnabled}
            />
            Allow OAuth clients to request registration
          </label>
          <p className="muted">
            New clients remain blocked until you approve their exact callback
            URLs below.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="annotationsEnabled"
              defaultChecked={settings.annotationsEnabled}
            />
            Allow administrators to grant image annotation access
          </label>
          <p className="muted">
            Separate comics:annotate scope. AI can update character names,
            visual tags and descriptions only. Read-only connections never
            receive this tool.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="previewEnabled"
              defaultChecked={settings.previewEnabled}
            />
            Allow administrators to grant unpublished chapter access
          </label>
          <p className="muted">
            Separate comics:preview scope. Admin connections can inspect drafts
            and unreleased chapters; ordinary reading tokens cannot.
          </p>
          <label className="field">
            Admin-created comics shared with AI connections (one publication ID
            per line)
            <textarea
              name="publicationIds"
              defaultValue={settings.allowedPublicationIds.join("\n")}
              rows={5}
            />
          </label>
          <p className="muted">
            Copy the ID of an admin-created comic from its Studio or review URL.
            Independent-author comics are never eligible. Leave empty to share
            nothing. Removing an ID immediately blocks new MCP reads and
            annotations for that comic.
          </p>
          <label className="field">
            Approved browser origins (one per line)
            <textarea
              name="origins"
              defaultValue={settings.allowedOrigins.join("\n")}
              placeholder="https://your-ai-client.example"
            />
          </label>
          <button className="primary">Save access controls</button>
        </fieldset>
      </form>
      <div className="mcp-admin-grid">
        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            void action.run(async () => {
              const result = await requestJson<{
                clientId: string;
                clientSecret: string | null;
              }>("/api/admin/mcp", {
                action: "client",
                client: {
                  name: f.get("name"),
                  redirectUris: String(f.get("redirectUris"))
                    .split(/\r?\n/)
                    .map((v) => v.trim())
                    .filter(Boolean),
                  confidential: f.has("confidential"),
                },
              });
              setCredential(
                `Client ID: ${result.clientId}${result.clientSecret ? `\nClient secret: ${result.clientSecret}` : "\nAuthentication method: none (PKCE)"}`,
              );
            }, "OAuth client created.");
          }}
        >
          <h2>Register an OAuth client</h2>
          <fieldset disabled={action.pending}>
            <label className="field">
              Client name
              <input name="name" required minLength={2} maxLength={100} />
            </label>
            <label className="field">
              Exact callback URLs (one per line)
              <textarea
                name="redirectUris"
                required
                placeholder="https://client.example/oauth/callback"
              />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="confidential" />
              Issue a client secret (server-side clients)
            </label>
            <p className="muted">
              PKCE S256 is required for every client. Use a public client for
              desktop apps. Never put a client secret in browser code.
            </p>
            <button className="secondary">Create approved client</button>
          </fieldset>
        </form>
        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            void action.run(async () => {
              const result = await requestJson<{ token: string }>(
                "/api/admin/mcp",
                {
                  action: "token",
                  name: f.get("name"),
                  email: f.get("email"),
                  days: Number(f.get("days")),
                  annotate: f.has("annotate"),
                  preview: f.has("preview"),
                },
              );
              setCredential(`Authorization: Bearer ${result.token}`);
            }, "Token created. Copy it now; it cannot be shown again.");
          }}
        >
          <h2>Create a Bearer token</h2>
          <fieldset disabled={action.pending || !settings.enabled}>
            <label className="field">
              Connection name
              <input name="name" required minLength={2} maxLength={100} />
            </label>
            <label className="field">
              Existing administrator email
              <input name="email" type="email" required />
            </label>
            <label className="field">
              Expires in days
              <input
                name="days"
                type="number"
                min={1}
                max={365}
                defaultValue={30}
                required
              />
            </label>
            <label className="checkbox-label">
              <input
                name="annotate"
                type="checkbox"
                disabled={!settings.annotationsEnabled}
              />
              Allow image annotation (admin account required)
            </label>
            <label className="checkbox-label">
              <input
                name="preview"
                type="checkbox"
                disabled={!settings.previewEnabled}
              />
              Read unpublished chapters (admin account required)
            </label>
            <button className="secondary">Create token</button>
          </fieldset>
        </form>
      </div>
      {credential && (
        <section className="panel" aria-label="New connection credential">
          <h2>Copy your new credential</h2>
          <p>
            This value is shown once. Store it in your AI client’s secret
            settings.
          </p>
          <pre className="mcp-value">{credential}</pre>
          <button className="secondary" onClick={() => setCredential("")}>
            Dismiss credential
          </button>
        </section>
      )}
      <p className="form-error" role="alert">
        {action.error}
      </p>
      <p className="form-success" role="status">
        {action.success}
      </p>
      <section className="panel">
        <h2>OAuth clients</h2>
        <p className="muted">
          Latest 100 clients. Verify the client and its callbacks before
          approving.
        </p>
        {!clients.length && <p>No clients registered yet.</p>}
        {clients.map((client) => (
          <article className="mcp-record" key={client.id}>
            <h3>
              {client.name} <span className="tag">{client.status}</span>
            </h3>
            <code className="mcp-value">{client.id}</code>
            <p>
              {client.confidential
                ? "Confidential client"
                : "Public client with PKCE"}
            </p>
            <ul>
              {client.redirectUris.map((uri) => (
                <li key={uri} className="mcp-value">
                  {uri}
                </li>
              ))}
            </ul>
            {client.status !== "approved" && (
              <button
                disabled={action.pending}
                className="secondary"
                onClick={() =>
                  void submit({
                    action: "client-status",
                    id: client.id,
                    status: "approved",
                  })
                }
              >
                Approve client
              </button>
            )}{" "}
            {client.status !== "revoked" && (
              <button
                disabled={action.pending}
                className="secondary"
                onClick={() =>
                  void submit({
                    action: "client-status",
                    id: client.id,
                    status: "revoked",
                  })
                }
              >
                Revoke client and connections
              </button>
            )}
          </article>
        ))}
      </section>
      <section className="panel">
        <h2>Tokens & connections</h2>
        <p className="muted">
          Latest 100 connections. Secrets are never displayed here.
        </p>
        {!grants.length && <p>No connections yet.</p>}
        {grants.map((grant) => (
          <article className="mcp-record" key={grant.id}>
            <h3>
              {grant.name} <span className="tag">{grant.kind}</span>
            </h3>
            <p className="mcp-value">Account: {grant.userId}</p>
            <p>
              {grant.scope} · Expires{" "}
              {new Date(grant.expiresAt).toLocaleDateString()}
            </p>
            {grant.revoked ? (
              <span className="status">Revoked</span>
            ) : (
              <button
                className="secondary"
                disabled={action.pending}
                onClick={() => void submit({ action: "revoke", id: grant.id })}
              >
                Revoke connection
              </button>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
