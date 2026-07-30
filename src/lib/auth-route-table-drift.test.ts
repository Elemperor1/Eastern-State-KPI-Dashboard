/**
 * Authorization-drift guard for the D8AD-CAN-003 replay matrix
 * (S087-C1).
 *
 * `PROTECTED_API_ROUTES` in `./auth-regression-helpers` is a
 * hand-maintained table; before this guard, a newly added
 * `src/app/api/** /route.ts` whose author forgot to register it there
 * failed NO test — the "exhaustive protected-route matrix" would
 * silently cease to be exhaustive. This suite walks the real
 * filesystem, extracts every exported HTTP method from every API
 * route module, and asserts the on-disk surface is EXACTLY:
 *
 *   PROTECTED_API_ROUTES  (behind the shared gate, replayed by the
 *                          regression suite)
 *   ∪
 *   UNGATED_API_ROUTE_EXCEPTIONS  (documented public/minimum routes
 *                                  that must not move behind the
 *                                  shared gate)
 *
 * It additionally asserts each protected route module actually CALLS
 * the gate function its table row names, and that every exception
 * module calls none of the shared gates — so a route that drops its
 * gate (or an exception that quietly grows one) fails here too.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  PROTECTED_API_ROUTES,
  UNGATED_API_ROUTE_EXCEPTIONS,
} from "./auth-regression-helpers";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const API_ROOT = path.join(REPO_ROOT, "src", "app", "api");

/** HTTP methods Next.js route modules may export. */
const ROUTE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

interface OnDiskRoute {
  method: string;
  path: string;
  /** Absolute route module path, for source-level assertions. */
  file: string;
}

/** Recursively collect every `route.ts` under `dir`. */
function listRouteModules(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listRouteModules(full));
    } else if (entry.isFile() && entry.name === "route.ts") {
      found.push(full);
    }
  }
  return found;
}

/**
 * Extract exported HTTP method names from a route module with the TypeScript
 * parser. This covers direct declarations plus valid ESM re-exports such as
 * `export { GET }` and `export { handler as POST }`; regex-only discovery
 * silently missed those forms and could make the auth matrix non-exhaustive.
 */
function exportedMethods(source: string): string[] {
  const exported = new Set<string>();
  const sourceFile = ts.createSourceFile(
    "route.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  /** Returns whether an exported name is an HTTP route method. */
  const isRouteMethod = (name: string): boolean =>
    (ROUTE_METHODS as readonly string[]).includes(name);
  /** Returns whether an AST node carries the ESM export modifier. */
  const hasExportModifier = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ) ?? false);

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && hasExportModifier(statement)) {
      const name = statement.name?.text;
      if (name && isRouteMethod(name)) exported.add(name);
      continue;
    }
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          isRouteMethod(declaration.name.text)
        ) {
          exported.add(declaration.name.text);
        }
      }
      continue;
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (isRouteMethod(element.name.text)) exported.add(element.name.text);
      }
    }
  }
  return ROUTE_METHODS.filter((method) => exported.has(method));
}

/** Walk `src/app/api` and return every route+method on disk. */
function walkApiRoutes(): OnDiskRoute[] {
  const routes: OnDiskRoute[] = [];
  for (const file of listRouteModules(API_ROOT)) {
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(API_ROOT, path.dirname(file));
    const urlPath = `/api/${relative.split(path.sep).join("/")}`;
    for (const method of exportedMethods(source)) {
      routes.push({ method, path: urlPath, file });
    }
  }
  return routes;
}

/** Sorted `METHOD /path` keys for readable diffs. */
function routeKeys(routes: Iterable<{ method: string; path: string }>): string[] {
  return Array.from(routes, (route) => `${route.method} ${route.path}`).sort();
}

const ON_DISK = walkApiRoutes();
const ON_DISK_BY_KEY = new Map(ON_DISK.map((route) => [`${route.method} ${route.path}`, route]));
const PROTECTED_KEYS = routeKeys(PROTECTED_API_ROUTES);
const EXCEPTION_KEYS = routeKeys(UNGATED_API_ROUTE_EXCEPTIONS);
const REGISTERED_KEYS = [...PROTECTED_KEYS, ...EXCEPTION_KEYS].sort();

describe("authz route-table drift guard (S087-C1)", () => {
  it("recognizes direct declarations, re-exports, and aliased route exports", () => {
    expect(
      exportedMethods(`
        export async function GET() {}
        export const PATCH = async () => {};
        const postHandler = async () => {};
        const DELETE = async () => {};
        export { postHandler as POST, DELETE };
      `),
    ).toEqual(["GET", "POST", "PATCH", "DELETE"]);
  });

  it("finds the expected API surface on disk (sanity: the walker is not vacuous)", () => {
    // If the walker breaks (wrong root, wrong regex) the set-equality
    // tests below could pass on an empty intersection; pin the current
    // counts so an empty/broken walk fails here first.
    expect(ON_DISK.length).toBeGreaterThanOrEqual(
      PROTECTED_API_ROUTES.length + UNGATED_API_ROUTE_EXCEPTIONS.length,
    );
    expect(PROTECTED_API_ROUTES.length).toBe(32);
    expect(ON_DISK.length).toBe(37);
  });

  it("every protected route+method on disk is registered in PROTECTED_API_ROUTES", () => {
    const unregistered = ON_DISK.filter(
      (route) => !REGISTERED_KEYS.includes(`${route.method} ${route.path}`),
    ).map((route) => `${route.method} ${route.path} (${path.relative(REPO_ROOT, route.file)})`);
    expect(
      unregistered,
      "New API route+method found on disk but registered in NEITHER " +
        "PROTECTED_API_ROUTES nor UNGATED_API_ROUTE_EXCEPTIONS. " +
        "Add it to the correct table in src/lib/auth-regression-helpers.ts " +
        "so the authz replay matrix covers it (or documents why it cannot be gated).",
    ).toEqual([]);
  });

  it("every registered table entry still exists on disk (no stale registrations)", () => {
    const stale = REGISTERED_KEYS.filter((key) => !ON_DISK_BY_KEY.has(key));
    expect(
      stale,
      "PROTECTED_API_ROUTES / UNGATED_API_ROUTE_EXCEPTIONS names a route+method " +
        "that no longer exists under src/app/api — remove the stale entry so the " +
        "table keeps matching the real surface.",
    ).toEqual([]);
  });

  it("the two tables are disjoint and duplicate-free", () => {
    expect(new Set(PROTECTED_KEYS).size).toBe(PROTECTED_KEYS.length);
    expect(new Set(EXCEPTION_KEYS).size).toBe(EXCEPTION_KEYS.length);
    const overlap = PROTECTED_KEYS.filter((key) => EXCEPTION_KEYS.includes(key));
    expect(overlap).toEqual([]);
  });

  it("every protected route module calls the gate its table row names", () => {
    const missingGate: string[] = [];
    for (const route of PROTECTED_API_ROUTES) {
      const onDisk = ON_DISK_BY_KEY.get(`${route.method} ${route.path}`);
      if (!onDisk) continue; // covered by the stale-registration test
      const source = fs.readFileSync(onDisk.file, "utf8");
      const gateCall = new RegExp(`\\b${route.gate}\\s*\\(`);
      if (!gateCall.test(source)) {
        missingGate.push(
          `${route.method} ${route.path} declares gate ${route.gate} but ` +
            `${path.relative(REPO_ROOT, onDisk.file)} never calls it`,
        );
      }
    }
    expect(missingGate).toEqual([]);
  });

  it("no exception module calls a shared gate (the exception stays deliberate)", () => {
    const gatedException: string[] = [];
    for (const exception of UNGATED_API_ROUTE_EXCEPTIONS) {
      const onDisk = ON_DISK_BY_KEY.get(`${exception.method} ${exception.path}`);
      if (!onDisk) continue; // covered by the stale-registration test
      const source = fs.readFileSync(onDisk.file, "utf8");
      const anyGateCall = /\brequire(?:Admin|StaffSession|Session)\s*\(/;
      if (anyGateCall.test(source)) {
        gatedException.push(
          `${exception.method} ${exception.path} is listed as ungated ("${exception.reason}") ` +
            `but ${path.relative(REPO_ROOT, onDisk.file)} now calls a shared gate — ` +
            "move it to PROTECTED_API_ROUTES.",
        );
      }
    }
    expect(gatedException).toEqual([]);
  });
});
