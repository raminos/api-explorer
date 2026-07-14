import type { FieldIr, ResourceIr } from "../ir/model.ts";

export const pascalCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");

const baseType = (field: FieldIr): string => {
  switch (field.kind) {
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "reference":
      return field.referenceValueKind === "integer" ? "number" : "string";
    case "enum":
      return field.enumValues.map(({ value }) => JSON.stringify(value)).join(" | ");
    default:
      return "string";
  }
};

export const typescriptType = (field: FieldIr): string =>
  `${baseType(field)}${field.nullable ? " | null" : ""}`;

export const renderInterface = (resource: ResourceIr): string => {
  const fields = resource.fields
    .map(
      (field) => `  readonly ${field.name}${field.required ? "" : "?"}: ${typescriptType(field)};`,
    )
    .join("\n");
  return `export interface ${pascalCase(resource.name)} {\n${fields}\n}`;
};
