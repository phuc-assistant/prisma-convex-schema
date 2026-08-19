import type {
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
  Decimal: {
    validator: "v.number()",
    comment: DECIMAL_COMMENT,
    warning: DECIMAL_WARNING,
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
): { validator: string | null; note: MappingNote; comment?: string } {
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
    return {
      validator: null,
      note: {
        model: modelName,
        field: field.name,
        prismaType,
        convexValidator: null,
        severity: "unsupported",
        message:
          "Bytes is unsupported; field omitted. Store blobs in Convex file storage instead.",
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

export function emitConvexSchema(schema: ParsedSchema): EmitResult {
  const notes: MappingNote[] = [];
  const tables: string[] = [];

  for (const model of schema.models) {
    const lines: string[] = [];
    for (const field of model.fields) {
      const mapped = mapField(model.name, field, schema);
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
