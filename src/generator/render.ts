import { Option, Schema } from "effect";
import type { FieldIr, ResourceIr } from "../ir/model.ts";

const quote = Schema.encodeSync(Schema.parseJson(Schema.String));

export const pascalCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");

const baseType = (field: FieldIr): string => {
  switch (field.kind) {
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "reference":
      return Option.contains(field.referenceValueKind, "integer") ? "number" : "string";
    case "enum":
      return field.enumValues.map(({ value }) => quote(value)).join(" | ");
    case "string":
    case "markdown":
    case "html":
    case "csv":
    case "url":
    case "email":
    case "date":
    case "time":
    case "datetime":
      return "string";
  }
};

export const typescriptType = (field: FieldIr): string =>
  `${baseType(field)}${field.nullable ? " | null" : ""}`;

export const renderInterface = (resource: ResourceIr): string => {
  const fields = resource.fields
    .map(
      (field) =>
        `  readonly ${field.name}: ${field.required ? typescriptType(field) : `Option.Option<${typescriptType(field)}>`};`,
    )
    .join("\n");
  return `export interface ${pascalCase(resource.name)} {\n${fields}\n}`;
};
