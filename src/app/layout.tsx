import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { currentUser } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: {
    default: "Astra Comics — Stories beyond the ordinary",
    template: "%s | Astra Comics",
  },
  description:
    "Independent voices. Extraordinary worlds. Discover original comics and art, read four pages freely, and follow the creators you love.",
  icons: { icon: "/art/astra-mark.svg" },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AppShell user={user ? { name: user.name, role: user.role } : null}>
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
