import { getSchema } from "@mrleebo/prisma-ast";
import type { Field, Func } from "@mrleebo/prisma-ast";
import type { ParsedField, ParsedModel, ParsedSchema } from "./types.ts";

function typeName(fieldType: string | Func): string {
  if (typeof fieldType === "string") return fieldType;
  return fieldType.name;
}

function attributeNames(field: Field): string[] {
  return (field.attributes ?? []).map((attribute) => attribute.name);
}

function isRelationField(field: Field, modelNames: Set<string>): boolean {
  const name = typeName(field.fieldType);
  if (modelNames.has(name)) return true;
  return attributeNames(field).includes("relation");
}

export function parsePrisma(source: string): ParsedSchema {
  const ast = getSchema(source);
  const models: ParsedModel[] = [];
  const enums: ParsedSchema["enums"] = [];

  for (const block of ast.list) {
    if (block.type === "enum") {
      const values = block.enumerators
        .filter((entry) => entry.type === "enumerator")
        .map((entry) => entry.name);
      enums.push({ name: block.name, values });
    }
  }

  const modelNames = new Set(
    ast.list.filter((block) => block.type === "model").map((block) => block.name),
  );

  for (const block of ast.list) {
    if (block.type !== "model") continue;
    const fields: ParsedField[] = [];
    for (const property of block.properties) {
      if (property.type !== "field") continue;
      fields.push({
        name: property.name,
        prismaType: typeName(property.fieldType),
        isArray: Boolean(property.array),
        isOptional: Boolean(property.optional),
        isRelation: isRelationField(property, modelNames),
        attributes: attributeNames(property),
      });
    }
    models.push({ name: block.name, fields });
  }

  return { models, enums };
}
