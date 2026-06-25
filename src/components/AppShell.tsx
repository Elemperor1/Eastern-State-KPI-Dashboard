import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LogoutButton } from "./LogoutButton";
import {
  LayoutDashboard,
  LineChart,
  Database,
  Tag,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
  { href: "/dashboard/trends", label: "Trend Explorer", icon: <LineChart className="w-4 h-4" /> },
  { href: "/admin/data", label: "Data Entry", icon: <Database className="w-4 h-4" />, adminOnly: true },
  { href: "/admin/kpis", label: "KPIs & Categories", icon: <Tag className="w-4 h-4" />, adminOnly: true },
  { href: "/admin/users", label: "Users", icon: <Users className="w-4 h-4" />, adminOnly: true },
];

export async function AppShell({
  children,
  active,
}: {
  children: ReactNode;
  active: string;
}) {
  const session = await getSession();
  if (!session.user) {
    redirect("/login");
  }
  const user: SessionUser = session.user;

  return (
    <div className="min-h-screen flex bg-ink-50">
      <aside className="w-64 shrink-0 bg-white border-r border-ink-200 flex flex-col">
        <div className="px-5 pt-6 pb-5 border-b border-ink-200">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-700 text-white">
              <LayoutDashboard className="w-4 h-4" />
            </span>
            <span>
              <span className="block text-[15px] font-display font-semibold leading-tight text-ink-900">
                Eastern State
              </span>
              <span className="block text-[11px] uppercase tracking-wider text-ink-500 leading-tight">
                KPI Intelligence
              </span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {NAV.filter((item) => !item.adminOnly || user.role === "admin").map((item) => {
            const isActive = active === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${isActive ? "nav-link-active" : ""}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-ink-200 px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-sm font-semibold">
              {user.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink-900 truncate">{user.name}</div>
              <div className="text-[11px] text-ink-500 capitalize">{user.role}</div>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
