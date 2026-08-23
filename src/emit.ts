import type {
  BytesMode,
  CompileOptions,
  DecimalMode,
  EmitResult,
  MappingNote,
  ParsedField,
  ParsedSchema,
} from "./types.ts";

/** Explicit, lossy Decimal default. Convex has no Decimal validator; keep v.number(). */
export const DECIMAL_WARNING =
  "Decimal mapped to v.number() (IEEE-754 float64). This is lossy: Prisma Decimal precision and scale are not preserved. Do not use the emitted field as money-safe storage. Convex has no Decimal validator in this compiler; a lossless default is tracked in issue #1 and is not the 0.1.x behavior.";

export const DECIMAL_COMMENT =
  "Prisma Decimal -> v.number (IEEE-754; not lossless)";

/** Opt-in lossless path for issue #1. Default remains v.number(). */
export const DECIMAL_STRING_WARNING =
  "Decimal mapped to v.string() (lossless opt-in for issue #1). Store decimal text, not IEEE-754. Default remains v.number(); pass --decimal=string to opt in.";

export const DECIMAL_STRING_COMMENT =
  "Prisma Decimal -> v.string (lossless opt-in)";

export const BYTES_OMIT_MESSAGE =
  "Bytes is unsupported; field omitted. Convex has v.bytes() and file storage; this compiler emits neither by default (issue #2). Store blobs in Convex file storage.";

export const BYTES_STRING_WARNING =
  "Bytes mapped to v.string() (base64-as-string opt-in for issue #2). The compiler does not encode or decode; store base64 text at the app layer. Not Convex v.bytes(), not file storage. Default remains omit.";

export const BYTES_STRING_COMMENT =
  "Prisma Bytes -> v.string (base64 text opt-in; not v.bytes)";

const SCALAR_MAP: Record<
  string,
  { validator: string; warning?: string; comment?: string }
> = {
  String: { validator: "v.string()" },
  Int: { validator: "v.number()" },
  Float: { validator: "v.number()" },
  BigInt: {
    validator: "v.number()",
    warning:
      "BigInt mapped to v.number(); values larger than Number.MAX_SAFE_INTEGER will lose precision.",
  },
  Boolean: { validator: "v.boolean()" },
  DateTime: {
    validator: "v.string()",
    comment: "ISO-8601 DateTime",
    warning: "DateTime mapped to v.string() (ISO-8601). Store UTC timestamps as strings.",
  },
  Json: {
    validator: "v.any()",
    warning: "Json mapped to v.any(); tighten this validator by hand.",
  },
};

function decimalSpec(mode: DecimalMode): {
  validator: string;
  warning: string;
  comment: string;
} {
  if (mode === "string") {
    return {
      validator: "v.string()",
      comment: DECIMAL_STRING_COMMENT,
      warning: DECIMAL_STRING_WARNING,
    };
  }
  return {
    validator: "v.number()",
    comment: DECIMAL_COMMENT,
    warning: DECIMAL_WARNING,
  };
}

function resolveOptions(options?: CompileOptions): {
  decimal: DecimalMode;
  bytes: BytesMode;
} {
  return {
    decimal: options?.decimal === "string" ? "string" : "number",
    bytes: options?.bytes === "string" ? "string" : "omit",
  };
}

export function convexTableName(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function wrap(validator: string, field: ParsedField): string {
  let next = validator;
  if (field.isArray) next = `v.array(${next})`;
  if (field.isOptional) next = `v.optional(${next})`;
  return next;
}

function enumUnion(values: string[]): string {
  if (values.length === 0) return "v.string()";
  if (values.length === 1) return `v.literal(${JSON.stringify(values[0])})`;
  return `v.union(${values.map((value) => `v.literal(${JSON.stringify(value)})`).join(", ")})`;
}

export function isDecimalField(field: ParsedField): boolean {
  return field.prismaType === "Decimal";
}

export function mapField(
  modelName: string,
  field: ParsedField,
  schema: ParsedSchema,
  options?: CompileOptions,
): { validator: string | null; note: MappingNote; comment?: string } {
  const { decimal, bytes } = resolveOptions(options);
  const prismaType =
    field.prismaType + (field.isArray ? "[]" : "") + (field.isOptional ? "?" : "");

  if (field.isRelation) {
    return {
      validator: null,
      note: {
        model: modelName,
        field: field.name,
        prismaType,
        convexValidator: null,
        severity: "info",
        message:
          "Relation omitted. Convex documents do not embed Prisma relations; keep the scalar foreign key if present.",
      },
    };
  }

  if (field.prismaType === "Bytes") {
    if (bytes === "string") {
      const validator = wrap("v.string()", field);
      return {
        validator,
        comment: BYTES_STRING_COMMENT,
        note: {
          model: modelName,
          field: field.name,
          prismaType,
          convexValidator: validator,
          severity: "warning",
          message: BYTES_STRING_WARNING,
        },
      };
    }
    return {
      validator: null,
      note: {
        model: modelName,
        field: field.name,
        prismaType,
        convexValidator: null,
        severity: "unsupported",
        message: BYTES_OMIT_MESSAGE,
      },
    };
  }

  const enumDef = schema.enums.find((entry) => entry.name === field.prismaType);
  if (enumDef) {
    const inner = enumUnion(enumDef.values);
    const validator = wrap(inner, field);
    return {
      validator,
      note: {
        model: modelName,
        field: field.name,
        prismaType,
        convexValidator: validator,
        severity: "info",
        message: `Enum ${field.prismaType} mapped to a union of string literals.`,
      },
    };
  }

  if (field.prismaType === "Decimal") {
    const spec = decimalSpec(decimal);
    const validator = wrap(spec.validator, field);
    return {
      validator,
      comment: spec.comment,
      note: {
        model: modelName,
        field: field.name,
        prismaType,
        convexValidator: validator,
        severity: "warning",
        message: spec.warning,
      },
    };
  }

  const scalar = SCALAR_MAP[field.prismaType];
  if (scalar) {
    const validator = wrap(scalar.validator, field);
    return {
      validator,
      comment: scalar.comment,
      note: {
        model: modelName,
        field: field.name,
        prismaType,
        convexValidator: validator,
        severity: scalar.warning ? "warning" : "info",
        message: scalar.warning ?? `${field.prismaType} mapped to ${validator}.`,
      },
    };
  }

  return {
    validator: null,
    note: {
      model: modelName,
      field: field.name,
      prismaType,
      convexValidator: null,
      severity: "unsupported",
      message: `Unsupported Prisma type ${field.prismaType}; field omitted.`,
    },
  };
}

export function emitConvexSchema(
  schema: ParsedSchema,
  options?: CompileOptions,
): EmitResult {
  const notes: MappingNote[] = [];
  const tables: string[] = [];

  for (const model of schema.models) {
    const lines: string[] = [];
    for (const field of model.fields) {
      const mapped = mapField(model.name, field, schema, options);
      notes.push(mapped.note);
      if (!mapped.validator) continue;
      const comment = mapped.comment ? ` // ${mapped.comment}` : "";
      lines.push(`    ${field.name}: ${mapped.validator},${comment}`);
    }
    const table = convexTableName(model.name);
    tables.push(`  ${table}: defineTable({\n${lines.join("\n")}\n  })`);
  }

  const convexSource = [
    'import { defineSchema, defineTable } from "convex/server";',
    'import { v } from "convex/values";',
    "",
    "// Generated by prisma-convex-schema. Review warnings in the mapping report.",
    "// Convex adds _id and _creationTime automatically; Prisma @id fields are kept as data.",
    "export default defineSchema({",
    tables.join(",\n") + (tables.length ? "," : ""),
    "});",
    "",
  ].join("\n");

  return { convexSource, notes };
}
