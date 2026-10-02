import type { ServiceId } from "@/domain/service";
export function serviceId(): ServiceId {
  const value = process.env.ASTRA_SERVICE ?? "reader";
  if (value !== "reader" && value !== "studio" && value !== "admin")
    throw new Error("Invalid service identity.");
  return value;
}
export function serviceOrigins() {
  const production = process.env.NODE_ENV === "production";
  function origin(name: string, port: number) {
    const value = process.env[name];
    if (!value && production) throw new Error(`Missing ${name}`);
    const url = new URL(value ?? `http://localhost:${port}`);
    if (
      production &&
      url.protocol !== "https:" &&
      process.env.ALLOW_LOCAL_STORAGE !== "true"
    )
      throw new Error("Production service origins require HTTPS.");
    return url.origin;
  }
  return {
    reader: origin("READER_ORIGIN", 3100),
    studio: origin("STUDIO_ORIGIN", 3101),
    admin: origin("ADMIN_ORIGIN", 3102),
  };
}
