import { serviceId, serviceOrigins } from "@/server/service";
import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { currentUser } from "@/server/session";
import { siteName } from "@/server/brand";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function generateMetadata(): Promise<Metadata> {
  const name = await siteName();
  return {
    title: {
      default: `${name} — Stories beyond the ordinary`,
      template: `%s | ${name}`,
    },
    description:
      "Independent voices. Extraordinary worlds. Discover original comics and art, read four pages freely, and follow the creators you love.",
    icons: { icon: "/art/astra-mark.svg" },
  };
}
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, name] = await Promise.all([currentUser(), siteName()]);
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AppShell
            service={serviceId()}
            origins={serviceOrigins()}
            siteName={name}
            user={user ? { name: user.name, role: user.role } : null}
          >
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
