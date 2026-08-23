/**
 * Conservative Prisma subset parser + Convex emitter.
 * Plain JS. No @mrleebo/prisma-ast, no Chevrotain, no backend.
 * Runs in the browser playground and in Node (headless checks).
 *
 * Supported: model, enum, String/Int/Float/Decimal/Boolean/DateTime/Json/Bytes,
 * optional (?), lists ([]). Relations (type is another model, or @relation) are skipped.
 * generator/datasource/@@attributes/views/composite types are ignored.
 * This is enough for fixtures/blog.prisma and fixtures/decimal.prisma.
 * It is not full Prisma.
 */
export const PARSER_KIND = "subset";

export const DECIMAL_WARNING =
  "Decimal mapped to v.number() (IEEE-754 float64). This is lossy: Prisma Decimal precision and scale are not preserved. Do not use the emitted field as money-safe storage. Convex has no Decimal validator in this compiler; a lossless default is tracked in issue #1 and is not the 0.1.x behavior.";

export const DECIMAL_COMMENT =
  "Prisma Decimal -> v.number (IEEE-754; not lossless)";

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

const SCALAR_MAP = {
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
    warning:
      "DateTime mapped to v.string() (ISO-8601). Store UTC timestamps as strings.",
  },
  Json: {
    validator: "v.any()",
    warning: "Json mapped to v.any(); tighten this validator by hand.",
  },
};

function stripLineComments(source) {
  return source
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

function extractBlocks(source) {
  const blocks = [];
  const re = /(enum|model|generator|datasource|type|view)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g;
  let match;
  while ((match = re.exec(source))) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      i += 1;
    }
    blocks.push({
      kind: match[1],
      name: match[2],
      body: source.slice(start, i - 1),
    });
    re.lastIndex = i;
  }
  return blocks;
}

function attributeNames(rest) {
  const names = [];
  const re = /@([A-Za-z_][A-Za-z0-9_.]*)/g;
  let match;
  while ((match = re.exec(rest))) names.push(match[1]);
  return names;
}

function parseEnumBody(body) {
  const values = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const token = line.split(/\s+/)[0];
    if (!token || token.startsWith("@@") || token.startsWith("@")) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) values.push(token);
  }
  return values;
}

function parseFieldLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("@@") || trimmed.startsWith("@")) return null;
  const match = trimmed.match(
    /^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)(\[\])?(\?)?\s*(.*)$/,
  );
  if (!match) return null;
  return {
    name: match[1],
    prismaType: match[2],
    isArray: Boolean(match[3]),
    isOptional: Boolean(match[4]),
    rest: match[5] ?? "",
  };
}

export function parseSubset(source) {
  const stripped = stripLineComments(source);
  const blocks = extractBlocks(stripped);
  const enums = [];
  for (const block of blocks) {
    if (block.kind === "enum") {
      enums.push({ name: block.name, values: parseEnumBody(block.body) });
    }
  }
  const modelNames = new Set(
    blocks.filter((block) => block.kind === "model").map((block) => block.name),
  );
  const models = [];
  for (const block of blocks) {
    if (block.kind !== "model") continue;
    const fields = [];
    for (const raw of block.body.split("\n")) {
      const parsed = parseFieldLine(raw);
      if (!parsed) continue;
      const attributes = attributeNames(parsed.rest);
      const isRelation =
        modelNames.has(parsed.prismaType) || attributes.includes("relation");
      fields.push({
        name: parsed.name,
        prismaType: parsed.prismaType,
        isArray: parsed.isArray,
        isOptional: parsed.isOptional,
        isRelation,
        attributes,
      });
    }
    models.push({ name: block.name, fields });
  }
  return { models, enums };
}

export function convexTableName(modelName) {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function wrap(validator, field) {
  let next = validator;
  if (field.isArray) next = `v.array(${next})`;
  if (field.isOptional) next = `v.optional(${next})`;
  return next;
}

function enumUnion(values) {
  if (values.length === 0) return "v.string()";
  if (values.length === 1) return `v.literal(${JSON.stringify(values[0])})`;
  return `v.union(${values.map((value) => `v.literal(${JSON.stringify(value)})`).join(", ")})`;
}

function decimalSpec(mode) {
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

function resolveOptions(options) {
  return {
    decimal: options && options.decimal === "string" ? "string" : "number",
    bytes: options && options.bytes === "string" ? "string" : "omit",
  };
}

export function mapField(modelName, field, schema, options) {
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

  const enumDef = (schema.enums || []).find((entry) => entry.name === field.prismaType);
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

export function emitConvexSchema(schema, options) {
  const notes = [];
  const tables = [];

  for (const model of schema.models) {
    const lines = [];
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
    "// Generated by prisma-convex-schema (subset parser). Review warnings in the mapping report.",
    "// Convex adds _id and _creationTime automatically; Prisma @id fields are kept as data.",
    "export default defineSchema({",
    tables.join(",\n") + (tables.length ? "," : ""),
    "});",
    "",
  ].join("\n");

  return { convexSource, notes };
}

function row(columns) {
  return `| ${columns.join(" | ")} |`;
}

function isDecimalNote(note) {
  return note.prismaType.replace("[]", "").replace("?", "") === "Decimal";
}

function isBytesNote(note) {
  return note.prismaType.replace("[]", "").replace("?", "") === "Bytes";
}

export function emitReport(schema, notes, options) {
  const decimalMode = options && options.decimal === "string" ? "string" : "number";
  const bytesMode = options && options.bytes === "string" ? "string" : "omit";
  const tableRows = schema.models.map((model) => {
    const modelNotes = notes.filter((note) => note.model === model.name);
    const kept = modelNotes.filter((note) => note.convexValidator).map((note) => note.field);
    const omitted = modelNotes.filter((note) => !note.convexValidator).map((note) => note.field);
    return row([
      model.name,
      convexTableName(model.name),
      kept.join(", ") || "-",
      omitted.join(", ") || "-",
    ]);
  });

  const fieldRows = notes.map((note) =>
    row([
      note.model,
      note.field,
      note.prismaType,
      note.convexValidator ?? "omitted",
      note.severity,
      note.message,
    ]),
  );

  const warnings = notes.filter((note) => note.severity === "warning");
  const unsupported = notes.filter(
    (note) => note.severity === "unsupported" || note.convexValidator === null,
  );
  const decimalNotes = notes.filter(isDecimalNote);
  const bytesNotes = notes.filter(isBytesNote);

  const lines = [
    "# Prisma to Convex mapping report",
    "",
    "Generated by prisma-convex-schema.",
    "Parser: conservative subset (plain JS). Not @mrleebo/prisma-ast. Relations skipped. Not full Prisma grammar.",
    "",
    "## Tables",
    "",
    row(["Prisma model", "Convex table", "Fields kept", "Fields omitted"]),
    row(["---", "---", "---", "---"]),
    ...tableRows,
    "",
    "## Field mapping",
    "",
    row(["Model", "Field", "Prisma", "Convex", "Severity", "Notes"]),
    row(["---", "---", "---", "---", "---", "---"]),
    ...fieldRows,
    "",
  ];

  if (decimalMode === "string") {
    lines.push("## Decimal precision (lossless opt-in, v.string)", "");
  } else {
    lines.push("## Decimal precision (explicit, lossy)", "");
  }

  if (decimalNotes.length === 0) {
    lines.push("No Prisma Decimal fields in this schema.");
  } else if (decimalMode === "string") {
    lines.push(DECIMAL_STRING_WARNING);
    lines.push("");
    lines.push("Decimal fields in this schema:");
    for (const note of decimalNotes) {
      lines.push(
        `- **${note.model}.${note.field}**: Prisma \`${note.prismaType}\` -> Convex \`${note.convexValidator}\` (lossless v.string opt-in; not IEEE-754)`,
      );
    }
  } else {
    lines.push(DECIMAL_WARNING);
    lines.push("");
    lines.push("Decimal fields in this schema:");
    for (const note of decimalNotes) {
      lines.push(
        `- **${note.model}.${note.field}**: Prisma \`${note.prismaType}\` -> Convex \`${note.convexValidator}\` (lossy IEEE-754; not money-safe)`,
      );
    }
  }

  if (bytesMode === "string") {
    lines.push("", "## Bytes (base64-as-string opt-in)", "");
  } else {
    lines.push("", "## Bytes (unsupported)", "");
  }

  if (bytesNotes.length === 0) {
    lines.push("No Prisma Bytes fields in this schema.");
  } else if (bytesMode === "string") {
    lines.push(BYTES_STRING_WARNING);
    lines.push("");
    lines.push("Bytes fields in this schema:");
    for (const note of bytesNotes) {
      lines.push(
        `- **${note.model}.${note.field}**: Prisma \`${note.prismaType}\` -> Convex \`${note.convexValidator}\` (base64 text opt-in; not v.bytes)`,
      );
    }
  } else {
    lines.push(BYTES_OMIT_MESSAGE);
    lines.push("");
    lines.push("Bytes fields in this schema (omitted from Convex schema; no v.bytes()):");
    for (const note of bytesNotes) {
      lines.push(
        `- **${note.model}.${note.field}**: Prisma \`${note.prismaType}\` -> omitted (unsupported)`,
      );
    }
  }

  lines.push("", "## Warnings", "");
  if (warnings.length === 0) {
    lines.push("None.");
  } else {
    for (const note of warnings) {
      lines.push(`- **${note.model}.${note.field}**: ${note.message}`);
    }
  }

  lines.push("", "## Unsupported / omitted", "");
  if (unsupported.length === 0) {
    lines.push("None.");
  } else {
    for (const note of unsupported) {
      lines.push(
        `- **${note.model}.${note.field}** (${note.prismaType}): ${note.message}`,
      );
    }
  }

  lines.push(
    "",
    "## Mapping reference",
    "",
    "- String -> `v.string()`",
    "- Int / Float -> `v.number()`",
    "- Decimal -> `v.number()` with an **explicit lossy warning** by default. `--decimal=string` stores Decimal as `v.string()` (lossless opt-in, issue #1).",
    "- Boolean -> `v.boolean()`",
    "- DateTime -> ISO-8601 `v.string()`",
    "- Json -> `v.any()` with a warning",
    "- Bytes -> omitted by default (no Convex `v.bytes()`). Dedicated **Bytes (unsupported)** section lists each field. `--bytes=string` stores Bytes as `v.string()` (base64 text opt-in; you encode at the app layer). Issue #2.",
    "- Enum -> `v.union` of `v.literal` values",
    "- Optional and lists wrap the inner validator",
    "- Relations omitted and listed above",
    "",
    "This compiler is a Prisma-file starting point. Other tools (for example @doeixd/gen) can emit Convex schema from their own config; this is not a claim to be first or unique.",
    "",
  );

  return lines.join("\n");
}

export function compileSubset(source, options = {}) {
  const schema = parseSubset(source);
  const { convexSource, notes } = emitConvexSchema(schema, options);
  const report = emitReport(schema, notes, options);
  return { schema, convexSource, report, notes, parser: PARSER_KIND };
}
