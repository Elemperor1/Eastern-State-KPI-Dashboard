import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listGoals } from "@/features/goals";
import { getDb, resetDb, SCHEMA_VERSION } from "@/lib/db";

describe("schema 9 migration", () => {
  let tmpDir: string;
  let dbPath: string;
  let originalDbPath: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-schema-test-"));
    dbPath = path.join(tmpDir, "test.db");
    originalDbPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = dbPath;
    resetDb();
  });

  afterEach(() => {
    resetDb();
    if (originalDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDbPath;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedCurrentFixture() {
    const db = getDb();
    db.prepare(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ('migration@example.org', 'Migration User', 'hash', 'admin')`,
    ).run();
    const userId = Number(
      (
        db
          .prepare("SELECT id FROM users WHERE email = 'migration@example.org'")
          .get() as { id: number }
      ).id,
    );
    db.prepare(
      `INSERT INTO categories (slug, name, sort_order)
       VALUES ('legacy-category', 'Legacy Category', 1)`,
    ).run();
    const categoryId = Number(
      (
        db
          .prepare("SELECT id FROM categories WHERE slug = 'legacy-category'")
          .get() as { id: number }
      ).id,
    );
    db.prepare(
      `INSERT INTO kpis (
         category_id, slug, name, unit, unit_type,
         reporting_frequency, direction, sort_order
       )
       VALUES (?, 'legacy-kpi', 'Legacy KPI', 'count', 'count',
               'annual', 'higher', 1)`,
    ).run(categoryId);
    const kpiId = Number(
      (
        db.prepare("SELECT id FROM kpis WHERE slug = 'legacy-kpi'").get() as {
          id: number;
        }
      ).id,
    );
    db.prepare(
      `INSERT INTO monthly_entries (kpi_id, year, month, value, updated_by)
       VALUES (?, 2024, 0, 10, ?), (?, 2026, 0, 20, ?)`,
    ).run(kpiId, userId, kpiId, userId);
    db.prepare(
      `INSERT INTO entry_history (
         entry_type, entry_id, kpi_id, year, month_or_label,
         new_value, changed_by, kpi_name, kpi_slug, kpi_unit,
         category_id, category_name, category_slug, changed_by_email
       )
       VALUES (
         'monthly', 1, ?, 2026, '0', 20, ?, 'Legacy KPI', 'legacy-kpi',
         'count', ?, 'Legacy Category', 'legacy-category',
         'migration@example.org'
       )`,
    ).run(kpiId, userId, categoryId);
    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('sample_data', '1')",
    ).run();
    return { db, kpiId, userId };
  }

  it("adds a fixed baseline year to schema-8 goals without losing data", () => {
    const { db, kpiId, userId } = seedCurrentFixture();
    db.exec("DROP TABLE kpi_goals;");
    db.exec(`
      CREATE TABLE kpi_goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
        target_year INTEGER NOT NULL,
        goal_type TEXT NOT NULL CHECK (goal_type IN ('pct','number')),
        target_value REAL NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (kpi_id, target_year)
      );
    `);
    db.prepare(
      `INSERT INTO kpi_goals (
         kpi_id, target_year, goal_type, target_value, created_by, updated_by
       )
       VALUES (?, 2029, 'number', 3, ?, ?)`,
    ).run(kpiId, userId, userId);
    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '8')",
    ).run();

    resetDb();
    const migrated = getDb();
    const goal = listGoals({ asOfYear: 2026 })[0];

    expect(SCHEMA_VERSION).toBe(9);
    expect(
      Number(
        (
          migrated
            .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
            .get() as { value: string }
        ).value,
      ),
    ).toBe(9);
    expect(goal).toMatchObject({
      kpi_id: kpiId,
      target_year: 2029,
      baseline_year: 2026,
      progress_year: 2026,
      full_year_target: 23,
      full_year_value: 20,
      full_year_progress_pct: 87,
    });
    expect(
      (
        migrated
          .prepare("SELECT email FROM users WHERE id = ?")
          .get(userId) as { email: string }
      ).email,
    ).toBe("migration@example.org");
    expect(
      Number(
        (
          migrated
            .prepare("SELECT COUNT(*) count FROM entry_history")
            .get() as { count: number }
        ).count,
      ),
    ).toBe(1);
  });

  it.each([4, 5, 6, 7])(
    "resets incompatible schema %s data while preserving users",
    (legacyVersion) => {
      const { db, userId } = seedCurrentFixture();
      db.prepare(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
      ).run(String(legacyVersion));

      resetDb();
      const migrated = getDb();
      const count = (table: string) =>
        Number(
          (
            migrated.prepare(`SELECT COUNT(*) count FROM ${table}`).get() as {
              count: number;
            }
          ).count,
        );

      expect(count("users")).toBe(1);
      expect(
        (
          migrated
            .prepare("SELECT email FROM users WHERE id = ?")
            .get(userId) as { email: string }
        ).email,
      ).toBe("migration@example.org");
      expect(count("categories")).toBe(0);
      expect(count("kpis")).toBe(0);
      expect(count("monthly_entries")).toBe(0);
      expect(count("entry_history")).toBe(0);
      expect(count("kpi_goals")).toBe(0);
      expect(
        migrated
          .prepare("SELECT value FROM meta WHERE key = 'sample_data'")
          .get(),
      ).toBeUndefined();
    },
  );
});
