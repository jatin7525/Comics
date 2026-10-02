import "server-only";
import { serviceId } from "./service";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/domain/models";
import { getServices } from "./services";

export function cookieName() {
  return process.env.NODE_ENV === "production"
    ? `__Host-astra_${serviceId()}_session`
    : `astra_${serviceId()}_session`;
}
export const currentUser = cache(async () =>
  getServices().auth.currentUser((await cookies()).get(cookieName())?.value),
);
export async function requireUser(roles?: Role[]) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/forbidden");
  return user;
}
