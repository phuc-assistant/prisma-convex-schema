import { emitConvexSchema } from "./emit.ts";
import { parsePrisma } from "./parse.ts";
import { emitReport } from "./report.ts";
import type { CompileOptions, CompileResult } from "./types.ts";

export type {
  CompileOptions,
  CompileResult,
  DecimalMode,
  EmitResult,
  MappingNote,
  ParsedEnum,
  ParsedField,
  ParsedModel,
  ParsedSchema,
  Severity,
} from "./types.ts";
export { parsePrisma } from "./parse.ts";
export {
  emitConvexSchema,
  mapField,
  convexTableName,
  DECIMAL_WARNING,
  DECIMAL_COMMENT,
  DECIMAL_STRING_WARNING,
  DECIMAL_STRING_COMMENT,
  isDecimalField,
} from "./emit.ts";
export { emitReport } from "./report.ts";

export function compile(
  source: string,
  options: CompileOptions = {},
): CompileResult {
  const schema = parsePrisma(source);
  const { convexSource, notes } = emitConvexSchema(schema, options);
  const report = emitReport(schema, notes, options);
  return { schema, convexSource, report, notes };
}
