import { requireUser } from "@/server/session";
import { mcpServices } from "@/server/mcp/services";
import { McpSettingsPanel } from "@/components/mcp-settings";
import { Intro } from "@/components/ui";
export default async function McpAdministration() {
  await requireUser(["admin"]);
  const { repository, resource } = mcpServices();
  const [settings, clients, grants] = await Promise.all([
    repository.settings(),
    repository.clients(),
    repository.grants(),
  ]);
  return (
    <>
      <Intro
        title="AI connections."
        description="One URL to connect your AI application to your comics."
      />
      <McpSettingsPanel
        settings={settings}
        endpoint={resource}
        grants={grants.map((g) => ({
          id: g.id,
          name: g.name,
          userId: g.userId,
          kind: g.kind,
          scope: g.scope,
          expiresAt: g.expiresAt.toISOString(),
          revoked:
            !!g.revokedAt ||
            g.generation !== settings.generation ||
            (g.clientId !== null &&
              clients.some(
                (c) =>
                  c.id === g.clientId &&
                  (c.status !== "approved" || c.revision !== g.clientRevision),
              )),
        }))}
      />
    </>
  );
}
