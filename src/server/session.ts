import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/domain/models";
import { getServices } from "./services";

export function cookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Host-astra_session"
    : "astra_session";
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
