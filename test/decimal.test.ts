import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.ts";
import { compile, DECIMAL_COMMENT, DECIMAL_WARNING } from "../src/index.ts";

describe("Decimal fixture and report", () => {
  it("keeps v.number for every Decimal field in fixtures/decimal.prisma", () => {
    const source = readFileSync(resolve("fixtures/decimal.prisma"), "utf8");
    const result = compile(source);
    expect(result.schema.models.map((model) => model.name)).toEqual([
      "CatalogItem",
      "InvoiceLine",
    ]);
    expect(result.convexSource).toContain("unitPrice: v.number()");
    expect(result.convexSource).toContain("taxRate: v.optional(v.number())");
    expect(result.convexSource).toContain("amount: v.number()");
    expect(result.convexSource).toContain("discount: v.number()");
    expect(result.convexSource).toContain(DECIMAL_COMMENT);
    // Do not switch Decimal to v.string in 0.1.x.
    expect(result.convexSource).not.toMatch(/unitPrice: v\.string\(\)/);
  });

  it("emits an explicit Decimal precision section in the mapping report", () => {
    const source = readFileSync(resolve("fixtures/decimal.prisma"), "utf8");
    const result = compile(source);
    expect(result.report).toContain("## Decimal precision (explicit, lossy)");
    expect(result.report).toContain(DECIMAL_WARNING);
    expect(result.report).toContain("CatalogItem.unitPrice");
    expect(result.report).toContain("CatalogItem.taxRate");
    expect(result.report).toContain("InvoiceLine.amount");
    expect(result.report).toContain("InvoiceLine.discount");
    expect(result.report).toMatch(/lossy IEEE-754; not money-safe/);
    const decimalNotes = result.notes.filter((note) =>
      note.prismaType.replace("[]", "").replace("?", "") === "Decimal",
    );
    expect(decimalNotes).toHaveLength(4);
    expect(decimalNotes.every((note) => note.severity === "warning")).toBe(true);
    expect(decimalNotes.every((note) => note.message === DECIMAL_WARNING)).toBe(
      true,
    );
  });

  it("optional Decimal stays v.optional(v.number()) with the same warning", () => {
    const result = compile("model Item {\n  tax Decimal?\n}\n");
    expect(result.convexSource).toContain("tax: v.optional(v.number())");
    const note = result.notes.find((entry) => entry.field === "tax");
    expect(note?.severity).toBe("warning");
    expect(note?.convexValidator).toBe("v.optional(v.number())");
    expect(result.report).toContain("Item.tax");
  });

  it("CLI on the decimal fixture writes the explicit warning into report.md", () => {
    const dir = mkdtempSync(join(tmpdir(), "pcs-dec-"));
    const outFile = join(dir, "schema.ts");
    const reportFile = join(dir, "report.md");
    const code = run([
      "--in",
      resolve("fixtures/decimal.prisma"),
      "--out",
      outFile,
      "--report",
      reportFile,
    ]);
    expect(code).toBe(0);
    const schema = readFileSync(outFile, "utf8");
    const report = readFileSync(reportFile, "utf8");
    expect(schema).toContain("catalogItem: defineTable({");
    expect(schema).toContain("invoiceLine: defineTable({");
    expect(schema).toContain(DECIMAL_COMMENT);
    expect(report).toContain("## Decimal precision (explicit, lossy)");
    expect(report).toContain(DECIMAL_WARNING);
  });
});
