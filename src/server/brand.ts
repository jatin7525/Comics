import "server-only";
import { cache } from "react";
import { DEFAULT_SITE_NAME } from "@/domain/brand";
import { getServices } from "./services";

export const siteName = cache(async () => {
  try {
    return (await getServices().administration.policy()).siteName;
  } catch {
    // Branding must never take a page down; fall back if the policy cannot be read.
    return process.env.SITE_NAME?.trim() || DEFAULT_SITE_NAME;
  }
});
