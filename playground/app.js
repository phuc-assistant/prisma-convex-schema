import { compileSubset } from "../src/subset.js";

const LIVE_PLAYGROUND =
  "https://phuc-assistant.github.io/prisma-convex-schema/playground/";

const BLOG_FIXTURE = `// Synthetic blog schema for prisma-convex-schema fixtures.
// No production data. No customer rows, tokens, or warehouse codes.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Status {
  DRAFT
  PUBLISHED
  ARCHIVED
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  bio       String?
  createdAt DateTime @default(now())
  posts     Post[]
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  body      String
  status    Status   @default(DRAFT)
  published Boolean  @default(false)
  views     Int      @default(0)
  score     Float?
  price     Decimal? @db.Decimal(10, 2)
  tags      String[]
  metadata  Json?
  cover     Bytes?
  author    User     @relation(fields: [authorId], references: [id])
  authorId  Int
  createdAt DateTime @default(now())
}
`;

const DECIMAL_FIXTURE = `// Synthetic catalog / invoice fixture for Decimal mapping.
// No production data. No customer rows, tokens, or warehouse codes.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model CatalogItem {
  id        Int      @id @default(autoincrement())
  sku       String   @unique
  unitPrice Decimal  @db.Decimal(12, 4)
  taxRate   Decimal? @db.Decimal(5, 4)
  qtyOnHand Int      @default(0)
}

model InvoiceLine {
  id       Int     @id @default(autoincrement())
  amount   Decimal @db.Decimal(19, 4)
  discount Decimal @db.Decimal(19, 4)
}
`;

const BYTES_FIXTURE = `// Synthetic Bytes fixture for prisma-convex-schema.
// No production data. No customer rows, tokens, or warehouse codes.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Asset {
  id    Int     @id @default(autoincrement())
  name  String
  blob  Bytes
  thumb Bytes?
}
`;

const inputEl = document.getElementById("input");
const schemaEl = document.getElementById("schema");
const reportEl = document.getElementById("report");
const statusEl = document.getElementById("status");
const formEl = document.getElementById("convert-form");

let activeDemo = "blog";

function decimalMode() {
  const checked = document.querySelector('input[name="decimal"]:checked');
  return checked && checked.value === "string" ? "string" : "number";
}

function bytesMode() {
  const checked = document.querySelector('input[name="bytes"]:checked');
  return checked && checked.value === "string" ? "string" : "omit";
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind || "ok";
}

function shareUrl() {
  const url = new URL(LIVE_PLAYGROUND);
  if (activeDemo) url.searchParams.set("demo", activeDemo);
  if (decimalMode() === "string") url.searchParams.set("decimal", "string");
  if (bytesMode() === "string") url.searchParams.set("bytes", "string");
  return url.toString();
}

function convert() {
  const source = inputEl.value;
  if (!source.trim()) {
    schemaEl.value = "";
    reportEl.value = "";
    setStatus("Paste a schema.prisma first.", "warn");
    return;
  }
  try {
    const result = compileSubset(source, {
      decimal: decimalMode(),
      bytes: bytesMode(),
    });
    schemaEl.value = result.convexSource;
    reportEl.value = result.report;
    const models = result.schema.models.length;
    const omitted = result.notes.filter((note) => note.convexValidator === null).length;
    const warnings = result.notes.filter((note) => note.severity === "warning").length;
    const bytes = result.notes.filter(
      (note) => note.prismaType.replace("[]", "").replace("?", "") === "Bytes",
    ).length;
    setStatus(
      `Subset parser. Models: ${models}. Warnings: ${warnings}. Omitted: ${omitted}. Bytes fields: ${bytes}. Runs in this browser only — no account, no API.`,
      "ok",
    );
  } catch (err) {
    schemaEl.value = "";
    reportEl.value = String(err && err.stack ? err.stack : err);
    setStatus("Convert failed. See the report pane.", "err");
  }
}

function loadBlog() {
  activeDemo = "blog";
  inputEl.value = BLOG_FIXTURE;
  convert();
}

function loadDecimal() {
  activeDemo = "decimal";
  inputEl.value = DECIMAL_FIXTURE;
  convert();
}

function loadBytes() {
  activeDemo = "bytes";
  inputEl.value = BYTES_FIXTURE;
  convert();
}

async function copyText(value, label) {
  try {
    await navigator.clipboard.writeText(value);
    setStatus(`Copied ${label}.`, "ok");
  } catch {
    setStatus(`Could not copy ${label} (clipboard blocked). Select the pane and copy manually.`, "warn");
  }
}

function applyQuery() {
  const params = new URLSearchParams(window.location.search);
  const demo = (params.get("demo") || "").toLowerCase();
  const decimal = params.get("decimal");
  const bytes = params.get("bytes");
  if (decimal === "string") {
    const radio = document.querySelector('input[name="decimal"][value="string"]');
    if (radio) radio.checked = true;
  }
  if (bytes === "string") {
    const radio = document.querySelector('input[name="bytes"][value="string"]');
    if (radio) radio.checked = true;
  }
  if (demo === "decimal") loadDecimal();
  else if (demo === "bytes") loadBytes();
  else loadBlog();
}

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  convert();
});

document.getElementById("load-blog").addEventListener("click", loadBlog);
document.getElementById("load-decimal").addEventListener("click", loadDecimal);
document.getElementById("load-bytes").addEventListener("click", loadBytes);
document.getElementById("copy-link").addEventListener("click", () => {
  copyText(shareUrl(), "live playground link");
});
document.getElementById("copy-schema").addEventListener("click", () => {
  copyText(schemaEl.value, "convex/schema.ts");
});
document.getElementById("copy-report").addEventListener("click", () => {
  copyText(reportEl.value, "mapping report");
});
for (const radio of document.querySelectorAll('input[name="decimal"]')) {
  radio.addEventListener("change", convert);
}
for (const radio of document.querySelectorAll('input[name="bytes"]')) {
  radio.addEventListener("change", convert);
}
inputEl.addEventListener("input", () => {
  activeDemo = null;
});
inputEl.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    convert();
  }
});

applyQuery();
