import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compile,
  DECIMAL_STRING_COMMENT,
  DECIMAL_STRING_WARNING,
} from "../src/index.ts";

describe("Decimal --decimal=string opt-in", () => {
  it("maps Decimal to v.string when options.decimal is string", () => {
    const source = readFileSync(resolve("fixtures/decimal.prisma"), "utf8");
    const result = compile(source, { decimal: "string" });
    expect(result.convexSource).toContain("unitPrice: v.string()");
    expect(result.convexSource).toContain("taxRate: v.optional(v.string())");
    expect(result.convexSource).toContain("amount: v.string()");
    expect(result.convexSource).toContain(DECIMAL_STRING_COMMENT);
    expect(result.convexSource).not.toMatch(/unitPrice: v\.number\(\)/);
    expect(result.report).toContain("## Decimal precision (lossless opt-in, v.string)");
    expect(result.report).toContain(DECIMAL_STRING_WARNING);
  });

  it("keeps default v.number when options.decimal is omitted", () => {
    const result = compile("model Item {\n  price Decimal\n}\n");
    expect(result.convexSource).toContain("price: v.number()");
    expect(result.convexSource).not.toContain("price: v.string()");
  });
});
