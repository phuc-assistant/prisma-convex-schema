import { compileSubset } from "./subset.js";

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

const inputEl = document.getElementById("input");
const schemaEl = document.getElementById("schema");
const reportEl = document.getElementById("report");
const statusEl = document.getElementById("status");
const formEl = document.getElementById("convert-form");

function decimalMode() {
  const checked = document.querySelector('input[name="decimal"]:checked');
  return checked && checked.value === "string" ? "string" : "number";
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind || "ok";
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
    const result = compileSubset(source, { decimal: decimalMode() });
    schemaEl.value = result.convexSource;
    reportEl.value = result.report;
    const models = result.schema.models.length;
    const omitted = result.notes.filter((note) => note.convexValidator === null).length;
    const warnings = result.notes.filter((note) => note.severity === "warning").length;
    setStatus(
      `Subset parser. Models: ${models}. Warnings: ${warnings}. Omitted: ${omitted}. Runs in this browser only — no account, no API.`,
      "ok",
    );
  } catch (err) {
    schemaEl.value = "";
    reportEl.value = String(err && err.stack ? err.stack : err);
    setStatus("Convert failed. See the report pane.", "err");
  }
}

function loadBlog() {
  inputEl.value = BLOG_FIXTURE;
  convert();
}

function loadDecimal() {
  inputEl.value = DECIMAL_FIXTURE;
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

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  convert();
});

document.getElementById("load-blog").addEventListener("click", loadBlog);
document.getElementById("load-decimal").addEventListener("click", loadDecimal);
document.getElementById("copy-schema").addEventListener("click", () => {
  copyText(schemaEl.value, "convex/schema.ts");
});
document.getElementById("copy-report").addEventListener("click", () => {
  copyText(reportEl.value, "mapping report");
});
for (const radio of document.querySelectorAll('input[name="decimal"]')) {
  radio.addEventListener("change", convert);
}
inputEl.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    convert();
  }
});

loadBlog();
