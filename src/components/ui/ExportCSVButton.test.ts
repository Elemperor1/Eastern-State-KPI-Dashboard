import { describe, expect, it } from "vitest";
import {
  buildCSV,
  ensureCsvExt,
  escapeCell,
  inferColumns,
} from "./csv-helpers";

describe("ExportCSVButton helpers", () => {
  describe("escapeCell", () => {
    it("returns empty string for null and undefined", () => {
      expect(escapeCell(null)).toBe("");
      expect(escapeCell(undefined)).toBe("");
    });

    it("passes plain strings through unchanged", () => {
      expect(escapeCell("hello")).toBe("hello");
      expect(escapeCell("123")).toBe("123");
    });

    it("stringifies numbers and booleans", () => {
      expect(escapeCell(42)).toBe("42");
      expect(escapeCell(0)).toBe("0");
      expect(escapeCell(-3.14)).toBe("-3.14");
      expect(escapeCell(true)).toBe("true");
      expect(escapeCell(false)).toBe("false");
    });

    it("quotes values containing commas", () => {
      expect(escapeCell("a,b")).toBe('"a,b"');
    });

    it("quotes values containing double quotes and escapes inner quotes", () => {
      expect(escapeCell('she said "hi"')).toBe('"she said ""hi"""');
    });

    it("quotes values containing newlines (CR or LF)", () => {
      expect(escapeCell("line1\nline2")).toBe('"line1\nline2"');
      expect(escapeCell("line1\r\nline2")).toBe('"line1\r\nline2"');
    });

    it("quotes values containing carriage returns alone", () => {
      expect(escapeCell("foo\rbar")).toBe('"foo\rbar"');
    });
  });

  describe("inferColumns", () => {
    it("returns the union of keys in first-seen order", () => {
      const rows = [
        { b: 1, a: 2 },
        { c: 3, a: 4 },
      ];
      expect(inferColumns(rows)).toEqual(["b", "a", "c"]);
    });

    it("returns an empty array when given no rows", () => {
      expect(inferColumns([])).toEqual([]);
    });

    it("skips null / non-object entries", () => {
      // Pass mixed junk through to confirm the runtime guard is robust.
      const rows: unknown[] = [null, undefined, { a: 1 }, "string", 42, { b: 2 }];
      expect(inferColumns(rows as Record<string, unknown>[])).toEqual(["a", "b"]);
    });

    it("preserves the explicit first-seen order even when later rows introduce new keys", () => {
      expect(inferColumns([{ x: 1, y: 2 }, { y: 3, z: 4, x: 5 }])).toEqual([
        "x",
        "y",
        "z",
      ]);
    });
  });

  describe("buildCSV", () => {
    it("emits header-only output when rows is empty", () => {
      expect(buildCSV([], ["a", "b"])).toBe("a,b\r\n");
    });

    it("emits CRLF-separated rows after the header", () => {
      const csv = buildCSV(
        [
          { a: 1, b: "x" },
          { a: 2, b: "y" },
        ],
        ["a", "b"],
      );
      expect(csv).toBe("a,b\r\n1,x\r\n2,y\r\n");
    });

    it("looks up each column by key on each row (missing keys become empty strings)", () => {
      const csv = buildCSV([{ a: 1 }, { a: 2, b: "y" }, {}], ["a", "b"]);
      expect(csv).toBe("a,b\r\n1,\r\n2,y\r\n,\r\n");
    });

    it("escapes cells that contain commas, quotes, or newlines", () => {
      const csv = buildCSV(
        [{ note: 'has, "quotes" and\nnewlines', n: 1 }],
        ["note", "n"],
      );
      expect(csv).toBe('note,n\r\n"has, ""quotes"" and\nnewlines",1\r\n');
    });

    it("respects the column order argument (not the row key order)", () => {
      const csv = buildCSV([{ a: 1, b: 2, c: 3 }], ["c", "a", "b"]);
      expect(csv).toBe("c,a,b\r\n3,1,2\r\n");
    });
  });

  describe("ensureCsvExt", () => {
    it("appends .csv when missing", () => {
      expect(ensureCsvExt("report")).toBe("report.csv");
    });

    it("is case-insensitive when checking the existing extension", () => {
      expect(ensureCsvExt("report.CSV")).toBe("report.CSV");
    });

    it("leaves a filename that already ends with .csv untouched", () => {
      expect(ensureCsvExt("report.csv")).toBe("report.csv");
    });
  });
});
