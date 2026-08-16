import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.ts";
import { compile, convexTableName, mapField, parsePrisma } from "../src/index.ts";

function compileModel(body: string): ReturnType<typeof compile> {
  return compile(`model Item {\n${body}\n}\n`);
}

describe("prisma-convex-schema", () => {
  it("maps String to v.string()", () => {
    const result = compileModel("  name String");
    expect(result.convexSource).toContain("name: v.string()");
  });

  it("maps Int and Float to v.number()", () => {
    const result = compileModel("  views Int\n  score Float");
    expect(result.convexSource).toContain("views: v.number()");
    expect(result.convexSource).toContain("score: v.number()");
  });

  it("maps Decimal to v.number() with a precision warning", () => {
    const result = compileModel("  price Decimal");
    expect(result.convexSource).toContain("price: v.number()");
    const note = result.notes.find((entry) => entry.field === "price");
    expect(note?.severity).toBe("warning");
    expect(note?.message).toMatch(/Decimal/i);
  });

  it("maps Boolean to v.boolean()", () => {
    const result = compileModel("  published Boolean");
    expect(result.convexSource).toContain("published: v.boolean()");
  });

  it("maps DateTime to an ISO-8601 string validator", () => {
    const result = compileModel("  createdAt DateTime");
    expect(result.convexSource).toContain("createdAt: v.string()");
    expect(result.convexSource).toContain("ISO-8601");
  });

  it("maps Json to v.any() with a warning", () => {
    const result = compileModel("  metadata Json");
    expect(result.convexSource).toContain("metadata: v.any()");
    const note = result.notes.find((entry) => entry.field === "metadata");
    expect(note?.severity).toBe("warning");
  });

  it("omits Bytes as unsupported", () => {
    const result = compileModel("  cover Bytes");
    expect(result.convexSource).not.toContain("cover:");
    const note = result.notes.find((entry) => entry.field === "cover");
    expect(note?.severity).toBe("unsupported");
    expect(note?.convexValidator).toBeNull();
    expect(result.report).toMatch(/Bytes is unsupported/);
  });

  it("maps Enum to a union of literals", () => {
    const result = compile(`
enum Status {
  DRAFT
  PUBLISHED
  ARCHIVED
}
model Post {
  status Status
}
`);
    expect(result.convexSource).toContain(
      'status: v.union(v.literal("DRAFT"), v.literal("PUBLISHED"), v.literal("ARCHIVED"))',
    );
  });

  it("wraps optional fields with v.optional", () => {
    const result = compileModel("  name String?");
    expect(result.convexSource).toContain("name: v.optional(v.string())");
  });

  it("wraps list fields with v.array", () => {
    const result = compileModel("  tags String[]");
    expect(result.convexSource).toContain("tags: v.array(v.string())");
  });

  it("wraps optional lists with both v.optional and v.array", () => {
    // Prisma grammar does not allow Type[]?; the emitter still wraps both flags.
    const mapped = mapField(
      "Item",
      {
        name: "tags",
        prismaType: "String",
        isArray: true,
        isOptional: true,
        isRelation: false,
        attributes: [],
      },
      { models: [], enums: [] },
    );
    expect(mapped.validator).toBe("v.optional(v.array(v.string()))");
  });

  it("omits relation fields and lists them in the report", () => {
    const result = compile(`
model User {
  id    Int   @id
  posts Post[]
}
model Post {
  id       Int  @id
  author   User @relation(fields: [authorId], references: [id])
  authorId Int
}
`);
    expect(result.convexSource).not.toMatch(/posts:/);
    expect(result.convexSource).not.toMatch(/author:/);
    expect(result.convexSource).toContain("authorId: v.number()");
    expect(result.report).toMatch(/Relation omitted/);
    const omitted = result.notes.filter(
      (note) => note.field === "posts" || note.field === "author",
    );
    expect(omitted).toHaveLength(2);
    expect(omitted.every((note) => note.convexValidator === null)).toBe(true);
  });

  it("compiles the synthetic blog fixture to user and post tables", () => {
    const source = readFileSync(resolve("fixtures/blog.prisma"), "utf8");
    const result = compile(source);
    expect(result.schema.models.map((model) => model.name)).toEqual([
      "User",
      "Post",
    ]);
    expect(result.convexSource).toContain("user: defineTable({");
    expect(result.convexSource).toContain("post: defineTable({");
    expect(result.convexSource).toContain("email: v.string()");
    expect(result.convexSource).toContain("title: v.string()");
    expect(result.report).toMatch(/Prisma to Convex mapping report/);
    expect(convexTableName("User")).toBe("user");
  });

  it("parses enum values from the fixture", () => {
    const source = readFileSync(resolve("fixtures/blog.prisma"), "utf8");
    const schema = parsePrisma(source);
    expect(schema.enums).toEqual([
      { name: "Status", values: ["DRAFT", "PUBLISHED", "ARCHIVED"] },
    ]);
  });

  it("writes schema and report files from the CLI", () => {
    const dir = mkdtempSync(join(tmpdir(), "pcs-"));
    const outFile = join(dir, "schema.ts");
    const reportFile = join(dir, "report.md");
    const code = run([
      "--in",
      resolve("fixtures/blog.prisma"),
      "--out",
      outFile,
      "--report",
      reportFile,
    ]);
    expect(code).toBe(0);
    const schema = readFileSync(outFile, "utf8");
    const report = readFileSync(reportFile, "utf8");
    expect(schema).toContain("export default defineSchema");
    expect(report).toContain("Field mapping");
    writeFileSync(join(dir, "ok"), "1");
  });
});
