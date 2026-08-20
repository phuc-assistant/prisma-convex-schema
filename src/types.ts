export type Severity = "info" | "warning" | "unsupported";

export type DecimalMode = "number" | "string";

export interface CompileOptions {
  decimal?: DecimalMode;
}

export interface MappingNote {
  model: string;
  field: string;
  prismaType: string;
  convexValidator: string | null;
  severity: Severity;
  message: string;
}

export interface ParsedEnum {
  name: string;
  values: string[];
}

export interface ParsedField {
  name: string;
  prismaType: string;
  isArray: boolean;
  isOptional: boolean;
  isRelation: boolean;
  attributes: string[];
}

export interface ParsedModel {
  name: string;
  fields: ParsedField[];
}

export interface ParsedSchema {
  models: ParsedModel[];
  enums: ParsedEnum[];
}

export interface EmitResult {
  convexSource: string;
  notes: MappingNote[];
}

export interface CompileResult {
  schema: ParsedSchema;
  convexSource: string;
  report: string;
  notes: MappingNote[];
}
