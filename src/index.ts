import { emitConvexSchema } from "./emit.ts";
import { parsePrisma } from "./parse.ts";
import { emitReport } from "./report.ts";
import type { CompileResult } from "./types.ts";

export type {
  CompileResult,
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
  isDecimalField,
} from "./emit.ts";
export { emitReport } from "./report.ts";

export function compile(source: string): CompileResult {
  const schema = parsePrisma(source);
  const { convexSource, notes } = emitConvexSchema(schema);
  const report = emitReport(schema, notes);
  return { schema, convexSource, report, notes };
}
