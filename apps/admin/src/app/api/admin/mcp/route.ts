import { api, actor, jsonInput } from "@/server/http";
import { serviceId } from "@/server/service";
import { ensure } from "@/domain/errors";
import { z } from "zod";
import { settingsSchema, clientSchema } from "@/domain/mcp/models";
import { mcpServices } from "@/server/mcp/services";
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enable") }),
  z.object({ action: z.literal("settings"), settings: settingsSchema }),
  z.object({ action: z.literal("client"), client: clientSchema }),
  z.object({
    action: z.literal("client-status"),
    id: z.string().uuid(),
    status: z.enum(["approved", "revoked"]),
  }),
  z.object({
    action: z.literal("token"),
    name: z.string().trim().min(2).max(100),
    email: z.email().max(254),
    days: z.number().int().min(1).max(365),
    annotate: z.boolean(),
    preview: z.boolean().default(false),
  }),
  z.object({ action: z.literal("revoke"), id: z.string().uuid() }),
]);
export const POST = api(
  async (context) => {
    ensure(serviceId() === "admin", "NOT_FOUND", "Not found.", 404);
    const input = await jsonInput(context.request, commandSchema);
    const user = actor(context);
    const { auth, repository } = mcpServices();
    switch (input.action) {
      case "enable": {
        const current = await repository.settings();
        const settings = settingsSchema.parse({
          enabled: current.enabled,
          registrationEnabled: current.registrationEnabled,
          annotationsEnabled: current.annotationsEnabled,
          previewEnabled: current.previewEnabled,
          allowedOrigins: current.allowedOrigins,
          allowedPublicationIds: current.allowedPublicationIds,
        });
        await auth.configure(user, {
          ...settings,
          enabled: true,
          registrationEnabled: true,
        });
        break;
      }
      case "settings":
        await auth.configure(user, input.settings);
        break;
      case "client": {
        const result = await auth.register(input.client, user);
        return Response.json({
          clientId: result.client.id,
          clientSecret: result.clientSecret,
        });
      }
      case "client-status":
        await auth.clientStatus(user, input.id, input.status);
        break;
      case "token":
        return Response.json(await auth.issueToken(user, input));
      case "revoke":
        await auth.revoke(user, input.id);
        break;
    }
    return Response.json({ ok: true });
  },
  { roles: ["admin"], limit: 30 },
);
