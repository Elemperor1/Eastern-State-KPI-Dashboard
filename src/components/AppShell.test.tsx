import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/types";
import { AppShell } from "./AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/overview",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function user(role: SessionUser["role"]): SessionUser {
  return {
    id: role === "admin" ? 1 : 2,
    email: `${role}@example.org`,
    name: role === "admin" ? "Admin User" : "Viewer User",
    role,
    must_change_password: false,
  };
}

describe("primary navigation", () => {
  it("shows viewers only Overview and Reports", () => {
    const html = renderToStaticMarkup(
      <AppShell user={user("viewer")}><p>Content</p></AppShell>,
    );
    expect(html).toContain('href="/dashboard/overview"');
    expect(html).toContain('href="/reports"');
    expect(html).not.toContain('href="/data-entry"');
    expect(html).not.toContain('href="/setup"');
  });

  it("shows admins the four product destinations", () => {
    const html = renderToStaticMarkup(
      <AppShell user={user("admin")}><p>Content</p></AppShell>,
    );
    for (const href of [
      "/dashboard/overview",
      "/reports",
      "/data-entry",
      "/setup",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });
});
