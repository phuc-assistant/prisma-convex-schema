import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.ts";
import {
  BYTES_OMIT_MESSAGE,
  BYTES_STRING_COMMENT,
  BYTES_STRING_WARNING,
  compile,
} from "../src/index.ts";

describe("Bytes mapping (issue #2)", () => {
  it("omits Bytes fields and lists them under Bytes (unsupported)", () => {
    const source = readFileSync(resolve("fixtures/bytes.prisma"), "utf8");
    const result = compile(source);
    expect(result.schema.models.map((model) => model.name)).toEqual(["Asset"]);
    expect(result.convexSource).toContain("asset: defineTable({");
    expect(result.convexSource).toContain("name: v.string()");
    expect(result.convexSource).not.toMatch(/blob:/);
    expect(result.convexSource).not.toMatch(/thumb:/);
    expect(result.convexSource).not.toMatch(/v\.bytes\(/);
    expect(result.report).toContain("## Bytes (unsupported)");
    expect(result.report).toContain(BYTES_OMIT_MESSAGE);
    expect(result.report).toContain("Asset.blob");
    expect(result.report).toContain("Asset.thumb");
    const notes = result.notes.filter(
      (note) => note.prismaType.replace("[]", "").replace("?", "") === "Bytes",
    );
    expect(notes).toHaveLength(2);
    expect(notes.every((note) => note.severity === "unsupported")).toBe(true);
    expect(notes.every((note) => note.convexValidator === null)).toBe(true);
  });

  it("maps Bytes to v.string when options.bytes is string", () => {
    const source = readFileSync(resolve("fixtures/bytes.prisma"), "utf8");
    const result = compile(source, { bytes: "string" });
    expect(result.convexSource).toContain("blob: v.string()");
    expect(result.convexSource).toContain("thumb: v.optional(v.string())");
    expect(result.convexSource).toContain(BYTES_STRING_COMMENT);
    expect(result.convexSource).not.toMatch(/v\.bytes\(/);
    expect(result.report).toContain("## Bytes (base64-as-string opt-in)");
    expect(result.report).toContain(BYTES_STRING_WARNING);
  });

  it("keeps blog fixture cover omitted by default", () => {
    const source = readFileSync(resolve("fixtures/blog.prisma"), "utf8");
    const result = compile(source);
    expect(result.convexSource).not.toMatch(/cover:/);
    expect(result.report).toContain("## Bytes (unsupported)");
    expect(result.report).toContain("Post.cover");
  });

  it("CLI default omits Bytes and writes the unsupported section", () => {
    const dir = mkdtempSync(join(tmpdir(), "pcs-bytes-"));
    const outFile = join(dir, "schema.ts");
    const reportFile = join(dir, "report.md");
    const code = run([
      "--in",
      resolve("fixtures/bytes.prisma"),
      "--out",
      outFile,
      "--report",
      reportFile,
    ]);
    expect(code).toBe(0);
    const schema = readFileSync(outFile, "utf8");
    const report = readFileSync(reportFile, "utf8");
    expect(schema).not.toMatch(/blob:/);
    expect(schema).not.toMatch(/v\.bytes\(/);
    expect(report).toContain("## Bytes (unsupported)");
    expect(report).toContain(BYTES_OMIT_MESSAGE);
  });

  it("CLI --bytes=string writes v.string without v.bytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "pcs-bytes-str-"));
    const outFile = join(dir, "schema.ts");
    const reportFile = join(dir, "report.md");
    const code = run([
      "--in",
      resolve("fixtures/bytes.prisma"),
      "--out",
      outFile,
      "--report",
      reportFile,
      "--bytes=string",
    ]);
    expect(code).toBe(0);
    const schema = readFileSync(outFile, "utf8");
    const report = readFileSync(reportFile, "utf8");
    expect(schema).toContain("blob: v.string()");
    expect(schema).toContain(BYTES_STRING_COMMENT);
    expect(schema).not.toMatch(/v\.bytes\(/);
    expect(report).toContain("## Bytes (base64-as-string opt-in)");
  });
});
