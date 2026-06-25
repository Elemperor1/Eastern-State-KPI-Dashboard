"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Building2,
  ChevronRight,
  LayoutDashboard,
  Menu,
  Settings,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Avatar, Button } from "@/components/ui";
import { LogoutButton } from "./LogoutButton";
import type { SessionUser } from "@/lib/types";

const NAV = [
  { href: "/dashboard/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/trends", label: "Trends", icon: TrendingUp },
  { href: "/admin/data", label: "Data entry", icon: BarChart3, adminOnly: true },
  { href: "/admin/kpis", label: "KPIs", icon: Settings, adminOnly: true },
  { href: "/admin/users", label: "Team", icon: Users, adminOnly: true },
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
      <Icon className="w-4 h-4 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
      {active ? <ChevronRight className="w-4 h-4 ml-auto shrink-0 opacity-60" aria-hidden /> : null}
    </Link>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const visibleNav = NAV.filter((item) => !item.adminOnly || user.role === "admin");

  return (
    <div className="min-h-screen flex">
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-white/90 backdrop-blur border-b border-ink-200 px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard/overview" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-700 text-white flex items-center justify-center">
            <Building2 className="w-4 h-4" aria-hidden />
          </div>
          <span className="text-sm font-semibold text-ink-900 truncate">Eastern State KPI</span>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          className="w-10 h-10 p-0"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Sidebar: desktop */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-ink-200 bg-white sticky top-0 h-screen">
        <div className="p-4">
          <Link href="/dashboard/overview" className="flex items-center gap-3 px-3 py-2">
            <div className="w-9 h-9 rounded-xl bg-brand-700 text-white flex items-center justify-center shadow-sm">
              <Building2 className="w-5 h-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-semibold text-ink-900 leading-tight truncate">Eastern State</span>
              <span className="block text-xs text-ink-500 truncate">KPI Intelligence</span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1" aria-label="Primary">
          {visibleNav.map((item) => (
            <NavItem key={item.href} item={item} active={pathname === item.href || pathname.startsWith(item.href + "/")} />
          ))}
        </nav>

        <div className="border-t border-ink-200 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Avatar initials={initials} size="md" variant="neutral" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink-900 truncate">{user.name}</div>
              <div className="text-xs text-ink-500 capitalize font-medium">{user.role}</div>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen ? (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-ink-900/20"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="w-64 flex flex-col bg-white border-r border-ink-200 h-full">
            <div className="p-4 flex items-center justify-between">
              <Link href="/dashboard/overview" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
                <div className="w-8 h-8 rounded-lg bg-brand-700 text-white flex items-center justify-center">
                  <Building2 className="w-4 h-4" aria-hidden />
                </div>
                <span className="text-sm font-semibold text-ink-900">Eastern State KPI</span>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="w-10 h-10 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1" aria-label="Primary">
              {visibleNav.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  active={pathname === item.href || pathname.startsWith(item.href + "/")}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </nav>
            <div className="border-t border-ink-200 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar initials={initials} size="md" variant="neutral" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink-900 truncate">{user.name}</div>
                  <div className="text-xs text-ink-500 capitalize font-medium">{user.role}</div>
                </div>
              </div>
              <LogoutButton />
            </div>
          </aside>
        </div>
      ) : null}

      <main className="flex-1 min-w-0 pt-14 lg:pt-0">{children}</main>
    </div>
  );
}
