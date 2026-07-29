import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminUserCreateForm } from "./AdminUserCreateForm";

describe("AdminUserCreateForm", () => {
  it("marks the invite password as a new password for credential managers", () => {
    const html = renderToStaticMarkup(
      <AdminUserCreateForm onSubmit={() => undefined} />,
    );

    expect(html).toContain('id="create-user-password"');
    expect(html).toContain('autoComplete="new-password"');
  });

  it("keeps the password policy bounds on the invite form", () => {
    const html = renderToStaticMarkup(
      <AdminUserCreateForm onSubmit={() => undefined} />,
    );

    expect(html).toContain('minLength="8"');
    expect(html).toContain('maxLength="256"');
  });
});
