import "server-only";
import { McpAuthService } from "@/application/mcp/auth-service";
import { McpReadingService } from "@/application/mcp/reading-service";
import { MongoMcp } from "@/infrastructure/mongo/mcp";
import { MongoImageAnnotations } from "@/infrastructure/mongo/image-annotations";
import { getServices } from "../services";
import { serviceOrigins } from "../service";
export function mcpServices() {
  const services = getServices();
  const repository = new MongoMcp();
  const origin = serviceOrigins().admin;
  return {
    repository,
    origin,
    resource: `${origin}/mcp`,
    auth: new McpAuthService(repository, services.accounts, `${origin}/mcp`),
    reading: new McpReadingService(
      services.publications,
      services.storage,
      new MongoImageAnnotations(),
      repository,
    ),
  };
}
