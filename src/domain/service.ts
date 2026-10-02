import type { Role } from "./models";
export type ServiceId = "reader" | "studio" | "admin";
export function canEnterService(service: ServiceId, role: Role): boolean {
  return (
    service === "reader" ||
    (service === "studio"
      ? role === "author" || role === "admin"
      : role === "admin")
  );
}
