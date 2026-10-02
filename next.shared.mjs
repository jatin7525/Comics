import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
/** @param {"reader" | "studio" | "admin"} service @returns {import("next").NextConfig} */
export function serviceConfig(service) {
  return {
    env: { ASTRA_SERVICE: service },
    turbopack: { root: root },
    outputFileTracingRoot: root,
    output: "standalone",
    poweredByHeader: false,
    serverExternalPackages: ["mongodb", "sharp"],
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "X-Frame-Options", value: "DENY" },
            {
              key: "Referrer-Policy",
              value: "strict-origin-when-cross-origin",
            },
            {
              key: "Permissions-Policy",
              value: "camera=(), microphone=(), geolocation=()",
            },
          ],
        },
      ];
    },
  };
}
