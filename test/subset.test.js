import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  BYTES_OMIT_MESSAGE,
  BYTES_STRING_COMMENT,
  BYTES_STRING_WARNING,
  compileSubset,
  DECIMAL_COMMENT,
  DECIMAL_STRING_COMMENT,
  DECIMAL_STRING_WARNING,
  DECIMAL_WARNING,
  parseSubset,
} from "../src/subset.js";

const blogPath = resolve("fixtures/blog.prisma");
const decimalPath = resolve("fixtures/decimal.prisma");
const bytesPath = resolve("fixtures/bytes.prisma");

describe("subset parser headless check", () => {
  it("converts fixtures/blog.prisma to user and post tables", () => {
    const source = readFileSync(blogPath, "utf8");
    const result = compileSubset(source);
    assert.deepEqual(
      result.schema.models.map((model) => model.name),
      ["User", "Post"],
    );
    assert.deepEqual(result.schema.enums, [
      { name: "Status", values: ["DRAFT", "PUBLISHED", "ARCHIVED"] },
    ]);
    assert.match(result.convexSource, /user: defineTable\(\{/);
    assert.match(result.convexSource, /post: defineTable\(\{/);
    assert.match(result.convexSource, /email: v\.string\(\)/);
    assert.match(result.convexSource, /title: v\.string\(\)/);
    assert.match(result.convexSource, /name: v\.optional\(v\.string\(\)\)/);
    assert.match(result.convexSource, /tags: v\.array\(v\.string\(\)\)/);
    assert.match(result.convexSource, /score: v\.optional\(v\.number\(\)\)/);
    assert.match(result.convexSource, /price: v\.optional\(v\.number\(\)\)/);
    assert.match(
      result.convexSource,
      /status: v\.union\(v\.literal\("DRAFT"\), v\.literal\("PUBLISHED"\), v\.literal\("ARCHIVED"\)\)/,
    );
    assert.match(result.convexSource, /authorId: v\.number\(\)/);
    assert.doesNotMatch(result.convexSource, /posts:/);
    assert.doesNotMatch(result.convexSource, /author:/);
    assert.doesNotMatch(result.convexSource, /cover:/);
    assert.match(result.report, /Prisma to Convex mapping report/);
    assert.match(result.report, /Relation omitted/);
    assert.match(result.report, /Bytes is unsupported/);
    assert.match(result.report, /## Bytes \(unsupported\)/);
    assert.match(result.report, /Post\.cover/);
    assert.doesNotMatch(result.convexSource, /v\.bytes\(/);
    assert.match(result.report, /subset/);
    assert.equal(result.parser, "subset");
  });

  it("converts fixtures/decimal.prisma with lossy v.number by default", () => {
    const source = readFileSync(decimalPath, "utf8");
    const result = compileSubset(source);
    assert.deepEqual(
      result.schema.models.map((model) => model.name),
      ["CatalogItem", "InvoiceLine"],
    );
    assert.match(result.convexSource, /unitPrice: v\.number\(\)/);
    assert.match(result.convexSource, /taxRate: v\.optional\(v\.number\(\)\)/);
    assert.match(result.convexSource, /amount: v\.number\(\)/);
    assert.equal(result.convexSource.includes(DECIMAL_COMMENT), true);
    assert.doesNotMatch(result.convexSource, /unitPrice: v\.string\(\)/);
    assert.match(result.report, /## Decimal precision \(explicit, lossy\)/);
    assert.equal(result.report.includes(DECIMAL_WARNING), true);
    assert.match(result.report, /CatalogItem\.unitPrice/);
  });

  it("maps Decimal to v.string when decimal=string", () => {
    const source = readFileSync(decimalPath, "utf8");
    const result = compileSubset(source, { decimal: "string" });
    assert.match(result.convexSource, /unitPrice: v\.string\(\)/);
    assert.match(result.convexSource, /taxRate: v\.optional\(v\.string\(\)\)/);
    assert.equal(result.convexSource.includes(DECIMAL_STRING_COMMENT), true);
    assert.match(result.report, /lossless opt-in/);
    assert.equal(result.report.includes(DECIMAL_STRING_WARNING), true);
  });

  it("maps scalars, optional, lists, enum, and skips relations", () => {
    const source = `
enum Status { DRAFT PUBLISHED }
model User {
  id Int @id
  posts Post[]
}
model Post {
  title String
  views Int
  score Float
  price Decimal
  published Boolean
  createdAt DateTime
  metadata Json
  cover Bytes
  tags String[]
  name String?
  status Status
  author User @relation(fields: [authorId], references: [id])
  authorId Int
}
`;
    const result = compileSubset(source);
    const schema = parseSubset(source);
    assert.equal(schema.models.length, 2);
    assert.match(result.convexSource, /title: v\.string\(\)/);
    assert.match(result.convexSource, /views: v\.number\(\)/);
    assert.match(result.convexSource, /published: v\.boolean\(\)/);
    assert.match(result.convexSource, /createdAt: v\.string\(\)/);
    assert.match(result.convexSource, /metadata: v\.any\(\)/);
    assert.match(result.convexSource, /tags: v\.array\(v\.string\(\)\)/);
    assert.match(result.convexSource, /name: v\.optional\(v\.string\(\)\)/);
    assert.doesNotMatch(result.convexSource, /cover:/);
    assert.doesNotMatch(result.convexSource, /author:/);
    assert.doesNotMatch(result.convexSource, /posts:/);
  });

  it("lists Bytes fields in a dedicated unsupported section and omits them by default", () => {
    const source = readFileSync(bytesPath, "utf8");
    const result = compileSubset(source);
    assert.deepEqual(
      result.schema.models.map((model) => model.name),
      ["Asset"],
    );
    assert.match(result.convexSource, /asset: defineTable\(\{/);
    assert.match(result.convexSource, /name: v\.string\(\)/);
    assert.doesNotMatch(result.convexSource, /blob:/);
    assert.doesNotMatch(result.convexSource, /thumb:/);
    assert.doesNotMatch(result.convexSource, /v\.bytes\(/);
    assert.match(result.report, /## Bytes \(unsupported\)/);
    assert.equal(result.report.includes(BYTES_OMIT_MESSAGE), true);
    assert.match(result.report, /Asset\.blob/);
    assert.match(result.report, /Asset\.thumb/);
  });

  it("maps Bytes to v.string when bytes=string without emitting v.bytes", () => {
    const source = readFileSync(bytesPath, "utf8");
    const result = compileSubset(source, { bytes: "string" });
    assert.match(result.convexSource, /blob: v\.string\(\)/);
    assert.match(result.convexSource, /thumb: v\.optional\(v\.string\(\)\)/);
    assert.equal(result.convexSource.includes(BYTES_STRING_COMMENT), true);
    assert.doesNotMatch(result.convexSource, /v\.bytes\(/);
    assert.match(result.report, /## Bytes \(base64-as-string opt-in\)/);
    assert.equal(result.report.includes(BYTES_STRING_WARNING), true);
    assert.match(result.report, /Asset\.blob/);
  });
});
