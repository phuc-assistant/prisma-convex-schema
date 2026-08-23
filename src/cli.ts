#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { compile } from "./index.ts";
import type { BytesMode, DecimalMode } from "./types.ts";

function printHelp(): void {
  const text = [
    "prisma-convex-schema - compile Prisma schema to Convex schema.ts",
    "",
    "Usage:",
    "  node --import tsx/esm src/cli.ts --in <schema.prisma> --out <schema.ts> --report <report.md> [--decimal=number|string] [--bytes=omit|string]",
    "",
    "Flags:",
    "  --in, --out, --report   required paths",
    "  --decimal=number        default; Decimal -> v.number() with a lossy IEEE-754 warning",
    "  --decimal=string        lossless opt-in for issue #1; Decimal -> v.string()",
    "  --bytes=omit            default; omit Bytes fields and list them under Bytes (unsupported)",
    "  --bytes=string          base64-as-string opt-in for issue #2; Bytes -> v.string() (you encode)",
    "",
    "This project is built and maintained by an AI agent (Tester) on GitHub",
    "account phuc-assistant. No warranty. Do not send money to the bot.",
    "Polar checkout is not live.",
  ].join("\n");
  console.log(text);
}

function parseArgs(argv: string[]): {
  inFile?: string;
  outFile?: string;
  reportFile?: string;
  decimal: DecimalMode;
  bytes: BytesMode;
  help: boolean;
  decimalError?: string;
  bytesError?: string;
} {
  const result: {
    inFile?: string;
    outFile?: string;
    reportFile?: string;
    decimal: DecimalMode;
    bytes: BytesMode;
    help: boolean;
    decimalError?: string;
    bytesError?: string;
  } = { help: false, decimal: "number", bytes: "omit" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--in" && next) {
      result.inFile = next;
      i += 1;
    } else if (arg === "--out" && next) {
      result.outFile = next;
      i += 1;
    } else if (arg === "--report" && next) {
      result.reportFile = next;
      i += 1;
    } else if (arg === "--decimal" && next) {
      if (next !== "number" && next !== "string") {
        result.decimalError = next;
      } else {
        result.decimal = next;
      }
      i += 1;
    } else if (arg?.startsWith("--decimal=")) {
      const value = arg.slice("--decimal=".length);
      if (value !== "number" && value !== "string") {
        result.decimalError = value;
      } else {
        result.decimal = value;
      }
    } else if (arg === "--bytes" && next) {
      if (next !== "omit" && next !== "string") {
        result.bytesError = next;
      } else {
        result.bytes = next;
      }
      i += 1;
    } else if (arg?.startsWith("--bytes=")) {
      const value = arg.slice("--bytes=".length);
      if (value !== "omit" && value !== "string") {
        result.bytesError = value;
      } else {
        result.bytes = value;
      }
    }
  }
  return result;
}

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

export function run(argv: string[]): number {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return 0;
  }
  if (args.decimalError) {
    printHelp();
    console.error(`\nerror: --decimal must be number or string, got ${args.decimalError}`);
    return 1;
  }
  if (args.bytesError) {
    printHelp();
    console.error(`\nerror: --bytes must be omit or string, got ${args.bytesError}`);
    return 1;
  }
  if (!args.inFile || !args.outFile || !args.reportFile) {
    printHelp();
    console.error("\nerror: --in, --out, and --report are required");
    return 1;
  }

  const source = readFileSync(resolve(args.inFile), "utf8");
  const result = compile(source, { decimal: args.decimal, bytes: args.bytes });
  writeFile(resolve(args.outFile), result.convexSource);
  writeFile(resolve(args.reportFile), result.report);

  const warnings = result.notes.filter((note) => note.severity === "warning").length;
  const omitted = result.notes.filter((note) => note.convexValidator === null).length;
  const decimals = result.notes.filter((note) =>
    note.prismaType.replace("[]", "").replace("?", "") === "Decimal",
  ).length;
  const bytesCount = result.notes.filter((note) =>
    note.prismaType.replace("[]", "").replace("?", "") === "Bytes",
  ).length;
  const decimalLabel =
    args.decimal === "string"
      ? "lossless v.string opt-in"
      : "lossy v.number";
  const bytesLabel =
    args.bytes === "string"
      ? "base64 v.string opt-in"
      : "omitted";
  console.log(`Wrote ${args.outFile}`);
  console.log(`Wrote ${args.reportFile}`);
  console.log(
    `Models: ${result.schema.models.length}; warnings: ${warnings}; omitted fields: ${omitted}; decimal fields: ${decimals} (${decimalLabel}); bytes fields: ${bytesCount} (${bytesLabel})`,
  );
  return 0;
}

const entry = process.argv[1] ?? "";
if (import.meta.url === `file://${entry}`) {
  process.exit(run(process.argv.slice(2)));
}
