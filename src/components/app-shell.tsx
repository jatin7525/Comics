"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BookOpen,
  Compass,
  Sparkles,
  Image as ImageIcon,
  Bookmark,
  History,
  Crown,
  ChartNoAxesCombined,
  Users,
  Wallet,
  Settings,
  ShieldCheck,
  FileClock,
  Flag,
  Search,
  Sun,
  Moon,
  Menu,
  X,
  LogOut,
  Bell,
  Star,
  Plus,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ServiceId } from "@/domain/service";
import type { Role } from "@/domain/models";

type LinkItem = [string, string, LucideIcon];
const readerLinks: LinkItem[] = [
  ["Discover", "/", Compass],
  ["All comics", "/comics", BookOpen],
  ["New releases", "/new", Sparkles],
  ["Art gallery", "/art", ImageIcon],
  ["My library", "/library", Bookmark],
  ["Reading history", "/history", History],
  ["Following", "/following", Bell],
  ["Membership", "/membership", Crown],
  ["Become an author", "/become-author", BookOpen],
];
const studioLinks: LinkItem[] = [
  ["Overview", "/studio", Compass],
  ["My publications", "/studio/publications", BookOpen],
  ["Art portfolio", "/studio/art", ImageIcon],
  ["Analytics", "/studio/analytics", ChartNoAxesCombined],
  ["Earnings", "/studio/earnings", Wallet],
  ["Audience", "/studio/audience", Users],
  ["Account", "/studio/settings", Settings],
];
const adminLinks: LinkItem[] = [
  ["Overview", "/admin", Compass],
  ["Review queue", "/admin/reviews", ShieldCheck],
  ["Author applications", "/admin/applications", Users],
  ["Content library", "/admin/content", BookOpen],
  ["Authors & access", "/admin/users", Users],
  ["Reader reports", "/admin/reports", Flag],
  ["Memberships", "/admin/memberships", Crown],
  ["Ad placements", "/admin/ads", ImageIcon],
  ["Policies", "/admin/policies", Settings],
  ["Audit log", "/admin/audit", FileClock],
];
export function AppShell({
  children,
  user,
  service,
  origins,
}: {
  children: ReactNode;
  service: ServiceId;
  origins: Record<ServiceId, string>;
  user: { name: string; role: Role } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const workspace = service;
  const links =
    workspace === "admin"
      ? adminLinks
      : workspace === "studio"
        ? studioLinks
        : readerLinks;
  const active =
    links.find(([, href]) => href === pathname)?.[0] ??
    (pathname.startsWith("/read") ? "Reading room" : "Your stories");
  async function logout() {
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok)
        throw new Error("Unable to sign out. Please try again.");
      router.push("/");
      router.refresh();
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : "Unable to sign out.",
      );
    }
  }
  if (pathname === "/login" || pathname === "/register") {
    return (
      <main className="auth-page" id="main-content">
        {children}
      </main>
    );
  }
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {open && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${open ? "open" : ""}`}
        aria-label="Main navigation"
      >
        <Link
          href="/"
          className="logo"
          aria-label="Astra Comics home"
          onClick={() => setOpen(false)}
        >
          <span className="logo-mark">
            <Star size={26} fill="currentColor" strokeWidth={1} />
          </span>
          <span className="brand-name">
            astra<span>COMICS</span>
          </span>
        </Link>
        <div className="edition">STORIES LIVE HERE</div>
        <nav className="nav-group">
          <div className="nav-label">
            {workspace === "reader"
              ? "Explore"
              : workspace === "studio"
                ? "Author Studio"
                : "Administration"}
          </div>
          {links.map(([label, href, Icon]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={pathname === href ? "page" : undefined}
              className={`nav-item ${pathname === href ? "active" : ""}`}
            >
              <Icon size={19} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {workspace === "reader" && (
            <div className="member-card">
              <Crown size={19} />
              <strong>A world beyond the preview.</strong>
              <p>Explore what’s coming for readers and independent creators.</p>
              <Link className="text-link" href="/membership">
                Explore Astra Plus
              </Link>
            </div>
          )}
          <div className="workspace">
            <span className="nav-label">Your workspaces</span>
            <Link
              href={origins.reader}
              className="workspace-link"
              onClick={() => setOpen(false)}
            >
              <Compass size={16} />
              <span>Reader platform</span>
            </Link>
            {user && ["author", "admin"].includes(user.role) && (
              <Link
                href={`${origins.studio}/studio`}
                className="workspace-link"
                onClick={() => setOpen(false)}
              >
                <BookOpen size={16} />
                <span>Author Studio</span>
              </Link>
            )}
            {user?.role === "admin" && (
              <Link
                href={`${origins.admin}/admin`}
                className="workspace-link"
                onClick={() => setOpen(false)}
              >
                <ShieldCheck size={16} />
                <span>Admin console</span>
              </Link>
            )}
          </div>
        </div>
      </aside>
      <main className="main" id="main-content">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
          <div className="breadcrumb">
            {workspace === "reader"
              ? "Explore"
              : workspace === "studio"
                ? "Author Studio"
                : "Admin"}{" "}
            <span> / </span> <b>{active}</b>
          </div>
          <div className="top-actions">
            <button
              className="theme-toggle"
              aria-label="Toggle dark theme"
              title="Toggle dark theme"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              <Moon className="theme-moon" size={18} />
              <Sun className="theme-sun" size={18} />
            </button>
            <form action={`${origins.reader}/comics`} className="search">
              <Search size={17} />
              <input
                name="search"
                type="search"
                aria-label="Search comics and creators"
                placeholder="Search stories & creators"
                maxLength={80}
              />
            </form>
            {user ? (
              <>
                <Link
                  href="/account"
                  className="account-link"
                  aria-label={`Account: ${user.name}`}
                >
                  <span className="avatar">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>{user.name.split(" ")[0]}</span>
                </Link>
                <button
                  className="logout-button"
                  onClick={logout}
                  aria-label="Sign out"
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="login-link">
                  Log in
                </Link>
                <Link href="/register" className="primary">
                  Get started
                </Link>
              </>
            )}
          </div>
        </header>
        {logoutError && (
          <p role="alert" className="error-banner">
            {logoutError}
          </p>
        )}
        <div className="content">
          {children}
          <footer className="footer">
            <span>
              © {new Date().getFullYear()} Astra Comics. Made for stories worth
              telling.
            </span>
            <div>
              <Link href="/about">About</Link>
              <Link href="/guidelines">Community guidelines</Link>
              <Link href="/privacy">Privacy</Link>
            </div>
          </footer>
        </div>
      </main>
    </>
  );
}
export function CreateLink() {
  return (
    <Link className="primary" href="/studio/publications/new">
      <Plus size={16} />
      New publication
    </Link>
  );
}
