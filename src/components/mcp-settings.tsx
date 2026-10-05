"use client";
import { useState } from "react";
import type { McpSettings } from "@/domain/mcp/models";
import { requestJson, useMutation } from "./mutation";
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
  grants,
}: {
  settings: McpSettings;
  endpoint: string;
  grants: Grant[];
}) {
  const action = useMutation();
  const [copyMessage, setCopyMessage] = useState("");
  const submit = (body: unknown) =>
    action.run(async () => {
      await requestJson("/api/admin/mcp", body);
    }, "Connection settings saved.");
  return (
    <div className="mcp-admin">
      <section className="panel">
        <h2>Connect your AI application</h2>
        <label className="field">
          Connection URL
          <input
            readOnly
            value={endpoint}
            onFocus={(event) => event.target.select()}
          />
        </label>
        <button
          className="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(endpoint);
              setCopyMessage("Connection URL copied.");
            } catch {
              setCopyMessage("Select the URL above and copy it manually.");
            }
          }}
        >
          Copy URL
        </button>
        <p role="status">{copyMessage}</p>
        <ol>
          <li>
            Paste this URL into your AI application’s MCP connector settings.
          </li>
          <li>Sign in on the comic site with your administrator account.</li>
          <li>
            Review the requested access and choose Allow to return to your AI
            application.
          </li>
        </ol>
        <p className="muted">
          Use an application that supports remote MCP with OAuth. Your password
          is entered only on this site. Each application’s connector support may
          vary.
        </p>
        {(!settings.enabled || !settings.registrationEnabled) && (
          <button
            className="primary"
            disabled={action.pending}
            onClick={() => void submit({ action: "enable" })}
          >
            Enable AI connections
          </button>
        )}
        <p className="muted">
          {!settings.enabled
            ? "Connections are disabled."
            : !settings.registrationEnabled
              ? "Enable automatic setup to connect using only this URL."
              : "Ready to connect."}
          {" All admin-created comics are available automatically."}
        </p>
      </section>
      <details>
        <summary>Access controls</summary>
        <form
          key={JSON.stringify(settings)}
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            void submit({
              action: "settings",
              settings: {
                enabled: f.has("enabled"),
                registrationEnabled: f.has("enabled"),
                annotationsEnabled: f.has("annotationsEnabled"),
                previewEnabled: f.has("previewEnabled"),
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
              Separate comics:preview scope. Admin connections can inspect
              drafts and unreleased chapters; ordinary reading tokens cannot.
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
      </details>
      <p className="form-error" role="alert">
        {action.error}
      </p>
      <p className="form-success" role="status">
        {action.success}
      </p>
      <details className="panel">
        <summary>Manage connections</summary>
        <h2>Connected applications</h2>
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
      </details>
    </div>
  );
}
