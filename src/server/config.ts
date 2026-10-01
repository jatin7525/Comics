import { z } from "zod";

const schema = z.object({
  APP_ORIGIN: z.url().default("http://localhost:3100"),
  MONGODB_URI: z.string().min(1),
  MONGODB_DATABASE: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default("astra_comics"),
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  LOCAL_R2_URL: z.url().default("http://127.0.0.1:8788"),
  LOCAL_R2_TOKEN: z.string().default(""),
  RATE_LIMIT_SECRET: z.string().min(32),
  R2_ENDPOINT: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  TRUSTED_IP_HEADER: z
    .enum(["cf-connecting-ip", "x-real-ip"])
    .default("cf-connecting-ip"),
});
export type Configuration = z.infer<typeof schema>;
let configuration: Configuration | undefined;
export function config(): Configuration {
  if (configuration) return configuration;
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `Invalid server configuration: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}. See .env.example.`,
    );
  const candidate = result.data;
  if (
    candidate.STORAGE_DRIVER === "local" &&
    candidate.LOCAL_R2_TOKEN.length < 32
  )
    throw new Error("LOCAL_R2_TOKEN must contain at least 32 characters.");
  if (
    process.env.NODE_ENV === "production" &&
    candidate.STORAGE_DRIVER === "local" &&
    process.env.ALLOW_LOCAL_STORAGE !== "true"
  )
    throw new Error(
      "Production requires STORAGE_DRIVER=r2. ALLOW_LOCAL_STORAGE=true is only for local production-mode tests.",
    );
  configuration = candidate;
  return configuration;
}
