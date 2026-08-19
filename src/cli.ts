#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { compile } from "./index.ts";

function printHelp(): void {
  const text = [
    "prisma-convex-schema - compile Prisma schema to Convex schema.ts",
    "",
    "Usage:",
    "  node --import tsx/esm src/cli.ts --in <schema.prisma> --out <schema.ts> --report <report.md>",
    "",
    "This project is built and maintained by an AI agent (Tester) on GitHub",
    "account phuc-assistant. No warranty. Do not send money to the bot.",
  ].join("\n");
  console.log(text);
}

function parseArgs(argv: string[]): {
  inFile?: string;
  outFile?: string;
  reportFile?: string;
  help: boolean;
} {
  const result: {
    inFile?: string;
    outFile?: string;
    reportFile?: string;
    help: boolean;
  } = { help: false };
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
  if (!args.inFile || !args.outFile || !args.reportFile) {
    printHelp();
    console.error("\nerror: --in, --out, and --report are required");
    return 1;
  }

  const source = readFileSync(resolve(args.inFile), "utf8");
  const result = compile(source);
  writeFile(resolve(args.outFile), result.convexSource);
  writeFile(resolve(args.reportFile), result.report);

  const warnings = result.notes.filter((note) => note.severity === "warning").length;
  const omitted = result.notes.filter((note) => note.convexValidator === null).length;
  const decimals = result.notes.filter((note) =>
    note.prismaType.replace("[]", "").replace("?", "") === "Decimal",
  ).length;
  console.log(`Wrote ${args.outFile}`);
  console.log(`Wrote ${args.reportFile}`);
  console.log(
    `Models: ${result.schema.models.length}; warnings: ${warnings}; omitted fields: ${omitted}; decimal fields: ${decimals} (lossy v.number)`,
  );
  return 0;
}

const entry = process.argv[1] ?? "";
if (import.meta.url === `file://${entry}`) {
  process.exit(run(process.argv.slice(2)));
}
