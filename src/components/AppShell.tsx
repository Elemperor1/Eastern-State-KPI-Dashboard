"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  Menu,
  Settings,
  X,
} from "lucide-react";
import { Avatar, BrandMark, Button, ConfirmDialog } from "@/components/ui";
import { useModalFocus } from "@/components/ui/useModalInteraction";
import { LogoutButton } from "./LogoutButton";
import {
  UnsavedChangesContext,
  type UnsavedChangesState,
} from "./UnsavedChangesContext";
import type { SessionUser } from "@/lib/types";
import { ROUTE_RECOVERY_FOCUS_KEY } from "@/lib/route-recovery-focus";

function hasUnsavedHistoryMarker(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as Record<string, unknown>).easternStateUnsavedGuard === true
  );
}

const NAV = [
  {
    href: "/dashboard/overview",
    label: "Overview",
    icon: LayoutDashboard,
    matches: ["/dashboard/overview"],
  },
  {
    href: "/reports",
    label: "Reports",
    icon: FileText,
    matches: ["/reports"],
  },
  {
    href: "/data-entry",
    label: "Data Entry",
    icon: BarChart3,
    adminOnly: true,
    matches: ["/data-entry"],
  },
  {
    href: "/setup",
    label: "Setup",
    icon: Settings,
    adminOnly: true,
    matches: [
      "/setup",
    ],
  },
];

function navItemIsActive(item: (typeof NAV)[number], pathname: string): boolean {
  return item.matches.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

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

  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Primary">
      <div className="space-y-1">
        {visibleNav.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            active={navItemIsActive(item, pathname)}
            onClick={onNavigate}
          />
        ))}
      </div>
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
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const mobileOpenRef = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const [unsaved, setUnsaved] = useState<UnsavedChangesState>({
    dirty: false,
    busy: false,
  });
  const [pendingNavigation, setPendingNavigation] = useState<
    { kind: "link"; href: string } | { kind: "history" } | null
  >(null);
  const historyGuardArmed = useRef(false);
  const setUnsavedState = useCallback((state: UnsavedChangesState) => {
    setUnsaved(state);
  }, []);

  useModalFocus({
    open: mobileOpen,
    containerRef: mobileDrawerRef,
    initialFocusRef: mobileCloseRef,
    onClose: () => setMobileOpen(false),
    inertBackground: false,
  });

  useEffect(() => {
    if (window.sessionStorage.getItem(ROUTE_RECOVERY_FOCUS_KEY) !== "main") return;
    window.sessionStorage.removeItem(ROUTE_RECOVERY_FOCUS_KEY);
    window.requestAnimationFrame(() => mainRef.current?.focus());
  }, []);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!unsaved.dirty) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [unsaved.dirty]);

  const armHistoryGuard = useCallback(() => {
    if (historyGuardArmed.current) return;
    window.history.pushState(
      { ...window.history.state, easternStateUnsavedGuard: true },
      "",
      window.location.href,
    );
    historyGuardArmed.current = true;
  }, []);

  useEffect(() => {
    if (!unsaved.dirty) {
      if (
        historyGuardArmed.current &&
        hasUnsavedHistoryMarker(window.history.state)
      ) {
        historyGuardArmed.current = false;
        window.history.back();
      }
      return;
    }

    armHistoryGuard();
    function guardHistoryNavigation() {
      if (!historyGuardArmed.current) return;
      historyGuardArmed.current = false;
      setPendingNavigation({ kind: "history" });
    }
    window.addEventListener("popstate", guardHistoryNavigation);
    return () => window.removeEventListener("popstate", guardHistoryNavigation);
  }, [armHistoryGuard, unsaved.dirty]);

  function guardLinkNavigation(event: ReactMouseEvent<HTMLDivElement>) {
    if (!unsaved.dirty || event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const target = event.target as Element | null;
    const anchor = target?.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (`${url.pathname}${url.search}${url.hash}` === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPendingNavigation({
      kind: "link",
      href: `${url.pathname}${url.search}${url.hash}`,
    });
  }

  return (
    <UnsavedChangesContext.Provider
      value={{ state: unsaved, setState: setUnsavedState }}
    >
    <div
      className="min-h-screen bg-ink-50"
      data-app-shell-content
      onClickCapture={guardLinkNavigation}
    >
      <a
        href="#main-content"
        inert={mobileOpen}
        className="fixed left-4 top-4 z-[80] -translate-y-24 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-ink-950 shadow-floating transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>

      <header
        className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between bg-ink-900 px-4 text-white lg:hidden"
        inert={mobileOpen}
      >
        <Link href="/dashboard/overview" className="flex min-h-11 items-center gap-3" aria-label="Eastern State home">
          <BrandMark size="sm" />
          <div>
            <span className="block text-sm font-semibold leading-tight">Eastern State</span>
            <span className="block text-[10px] uppercase tracking-[0.1em] text-white/50">Strategic Plan</span>
          </div>
        </Link>
        <Button
          ref={mobileOpenRef}
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
        <Link href="/dashboard/overview" className="mx-4 mb-8 mt-5 flex items-center gap-3" aria-label="Eastern State home">
            <BrandMark size="md" />
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">Eastern State</span>
            <span className="mt-1 block truncate text-[10px] uppercase tracking-[0.1em] text-white/50">
              Strategic Plan
            </span>
          </div>
        </Link>
        <ShellNavigation user={user} pathname={pathname} />
        <AccountBlock user={user} />
      </aside>

      <div
        className="mobile-drawer-layer fixed inset-0 z-50 lg:hidden"
        data-state={mobileOpen ? "open" : "closed"}
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
      >
          <Button
            type="button"
            variant="ghost"
            className="mobile-drawer-scrim absolute inset-0 min-h-0 w-full rounded-none bg-ink-950/65 p-0 backdrop-blur-[2px] hover:bg-ink-950/65 active:scale-100"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <aside
            ref={mobileDrawerRef}
            className="mobile-drawer-panel relative flex h-full w-[min(19rem,86vw)] flex-col bg-ink-900 text-white shadow-floating focus:outline-none"
            tabIndex={-1}
          >
            <div className="mb-8 flex items-center justify-between px-4 pt-5">
              <Link
                href="/dashboard/overview"
                className="flex items-center gap-3"
                onClick={() => setMobileOpen(false)}
              >
                <BrandMark size="md" />
                <div>
                  <span className="block text-sm font-semibold">Eastern State</span>
                  <span className="block text-[10px] uppercase tracking-[0.1em] text-white/50">Strategic Plan</span>
                </div>
              </Link>
              <Button
                ref={mobileCloseRef}
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

      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        inert={mobileOpen}
        className="min-w-0 pt-16 focus:outline-none lg:ml-60 lg:pt-0"
      >
        {children}
      </main>
      <ConfirmDialog
        open={pendingNavigation !== null}
        title="Leave without saving?"
        description="Your changes have not been saved. Stay here to keep working, or leave and discard them."
        confirmLabel="Leave page"
        cancelLabel="Keep editing"
        tone="danger"
        onClose={() => {
          const pending = pendingNavigation;
          setPendingNavigation(null);
          if (pending?.kind === "history" && unsaved.dirty) armHistoryGuard();
        }}
        onConfirm={() => {
          const pending = pendingNavigation;
          setPendingNavigation(null);
          historyGuardArmed.current = false;
          setUnsaved({ dirty: false, busy: false });
          if (pending?.kind === "history") {
            window.history.back();
          } else if (pending?.kind === "link") {
            router.replace(pending.href);
          }
        }}
      />
    </div>
    </UnsavedChangesContext.Provider>
  );
}
