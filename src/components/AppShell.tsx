"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Crosshair,
  History,
  LayoutDashboard,
  Menu,
  Settings,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Avatar, BrandMark, Button } from "@/components/ui";
import { LogoutButton } from "./LogoutButton";
import type { SessionUser } from "@/lib/types";

const NAV = [
  { href: "/dashboard/overview", label: "Overview", icon: LayoutDashboard, group: "Explore" },
  { href: "/dashboard/trends", label: "Trends", icon: TrendingUp, group: "Explore" },
  { href: "/admin/data", label: "Data entry", icon: BarChart3, adminOnly: true, group: "Manage" },
  { href: "/admin/kpis", label: "KPIs", icon: Settings, adminOnly: true, group: "Manage" },
  { href: "/admin/goals", label: "Goals", icon: Crosshair, adminOnly: true, group: "Manage" },
  { href: "/admin/history", label: "History", icon: History, adminOnly: true, group: "Manage" },
  { href: "/admin/users", label: "Team", icon: Users, adminOnly: true, group: "Manage" },
];

function NavItem({
  item,
  active,
  onClick,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`nav-link ${active ? "nav-link-active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.8} aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function ShellNavigation({
  user,
  pathname,
  onNavigate,
}: {
  user: SessionUser;
  pathname: string;
  onNavigate?: () => void;
}) {
  const visibleNav = NAV.filter((item) => !item.adminOnly || user.role === "admin");
  const groups = Array.from(new Set(visibleNav.map((item) => item.group)));

  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Primary">
      {groups.map((group) => (
        <div key={group} className="mb-6">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
            {group}
          </p>
          <div className="space-y-1">
            {visibleNav
              .filter((item) => item.group === group)
              .map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                  onClick={onNavigate}
                />
              ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function AccountBlock({ user }: { user: SessionUser }) {
  const authDisabled = user.email === "auth-disabled@local";
  if (authDisabled) return null;

  const initials = user.name
    .split(" ")
    .map((name) => name[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="border-t border-white/10 p-4">
      <div className="mb-3 flex items-center gap-3 px-1">
        <Avatar initials={initials} size="md" variant="brand" className="bg-white/10 text-white" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">
            {user.role}
          </p>
        </div>
      </div>
      <LogoutButton />
    </div>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-ink-50">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[80] -translate-y-24 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-ink-950 shadow-floating transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>

      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between bg-ink-900 px-4 text-white lg:hidden">
        <Link href="/dashboard/overview" className="flex min-h-11 items-center gap-3" aria-label="Eastern State KPI home">
          <BrandMark size="sm" inverted />
          <div>
            <span className="block text-sm font-semibold leading-tight">Eastern State</span>
            <span className="block text-[10px] uppercase tracking-[0.1em] text-white/50">KPI Intelligence</span>
          </div>
        </Link>
        <Button
          variant="darkGhost"
          size="sm"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          className="size-11 p-0"
        >
          <Menu className="size-5" aria-hidden />
        </Button>
      </header>

      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-ink-900 text-white lg:flex">
        <Link href="/dashboard/overview" className="mx-4 mb-8 mt-5 flex items-center gap-3" aria-label="Eastern State KPI home">
          <BrandMark size="md" inverted />
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">Eastern State</span>
            <span className="mt-1 block truncate text-[10px] uppercase tracking-[0.1em] text-white/50">
              KPI Intelligence
            </span>
          </div>
        </Link>
        <ShellNavigation user={user} pathname={pathname} />
        <AccountBlock user={user} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <Button
            type="button"
            variant="ghost"
            className="absolute inset-0 min-h-0 w-full rounded-none bg-ink-950/65 p-0 backdrop-blur-[2px] hover:bg-ink-950/65 active:scale-100"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="page-enter relative flex h-full w-[min(19rem,86vw)] flex-col bg-ink-900 text-white shadow-floating">
            <div className="mb-8 flex items-center justify-between px-4 pt-5">
              <Link
                href="/dashboard/overview"
                className="flex items-center gap-3"
                onClick={() => setMobileOpen(false)}
              >
                <BrandMark size="md" inverted />
                <div>
                  <span className="block text-sm font-semibold">Eastern State</span>
                  <span className="block text-[10px] uppercase tracking-[0.1em] text-white/50">KPI Intelligence</span>
                </div>
              </Link>
              <Button
                variant="darkGhost"
                size="sm"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="size-11 p-0"
              >
                <X className="size-5" aria-hidden />
              </Button>
            </div>
            <ShellNavigation user={user} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <AccountBlock user={user} />
          </aside>
        </div>
      ) : null}

      <main id="main-content" className="min-w-0 pt-16 lg:ml-60 lg:pt-0">
        {children}
      </main>
    </div>
  );
}
