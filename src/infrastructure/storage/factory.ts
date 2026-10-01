import type { ObjectStorage } from "@/application/ports";
import { config } from "@/server/config";
import { LocalR2Storage } from "./local-r2";
import { CloudflareR2Storage } from "./cloudflare-r2";

export function createStorage(): ObjectStorage {
  const env = config();
  if (env.STORAGE_DRIVER === "local")
    return new LocalR2Storage(env.LOCAL_R2_URL, env.LOCAL_R2_TOKEN);
  if (
    !env.R2_ENDPOINT ||
    !env.R2_BUCKET ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY
  )
    throw new Error("R2 storage credentials are missing.");
  return new CloudflareR2Storage(
    env.R2_BUCKET,
    env.R2_ENDPOINT,
    env.R2_ACCESS_KEY_ID,
    env.R2_SECRET_ACCESS_KEY,
  );
}
