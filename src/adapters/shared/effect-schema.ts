import { Option, Schema } from "effect";
import type { ApiIr, FieldIr } from "../../ir/model.ts";
import { pascalCase } from "./typescript.ts";

const quote = Schema.encodeSync(Schema.parseJson(Schema.String));

const arrayElementSchema = (field: FieldIr): string =>
  Option.match(field.arrayElement, {
    onNone: () => "Schema.Never",
    onSome: (element) => {
      switch (element.kind) {
        case "integer":
          return "Schema.Number.pipe(Schema.int())";
        case "number":
          return "Schema.Number";
        case "boolean":
          return "Schema.Boolean";
        case "enum":
          return `Schema.Literal(${element.enumValues.map(({ value }) => quote(value)).join(", ")})`;
        case "reference":
          return Option.contains(element.referenceValueKind, "integer")
            ? "Schema.Number.pipe(Schema.int())"
            : "Schema.String";
        case "url":
          return "Schema.String.pipe(Schema.pattern(/^https?:\\/\\//))";
        case "email":
          return "Schema.String.pipe(Schema.pattern(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/))";
        case "phone":
          return "Schema.String.pipe(Schema.pattern(/^\\+?[0-9][0-9 ()-]{5,24}$/))";
        case "uuid":
          return "Schema.String.pipe(Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i))";
        case "string":
          return "Schema.String";
      }
    },
  });

export const renderFieldSchema = (field: FieldIr): string => {
  let schema: string;
  switch (field.kind) {
    case "integer":
      schema = "Schema.Number.pipe(Schema.int())";
      break;
    case "number":
      schema = "Schema.Number";
      break;
    case "boolean":
      schema = "Schema.Boolean";
      break;
    case "array": {
      const filters: Array<string> = [];
      if (Option.isSome(field.constraints.minItems))
        filters.push(`Schema.minItems(${field.constraints.minItems.value})`);
      if (Option.isSome(field.constraints.maxItems))
        filters.push(`Schema.maxItems(${field.constraints.maxItems.value})`);
      if (field.constraints.uniqueItems)
        filters.push(
          'Schema.filter((items) => EffectArray.dedupe(items).length === items.length, { message: () => "Expected unique array items" })',
        );
      schema = `Schema.Array(${arrayElementSchema(field)})`;
      if (filters.length > 0) schema = `${schema}.pipe(${filters.join(", ")})`;
      break;
    }
    case "reference":
      schema = Option.contains(field.referenceValueKind, "integer")
        ? "Schema.Number.pipe(Schema.int())"
        : "Schema.String";
      break;
    case "enum":
      schema = `Schema.Literal(${field.enumValues.map(({ value }) => quote(value)).join(", ")})`;
      break;
    case "email":
      schema = "Schema.String.pipe(Schema.pattern(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/))";
      break;
    case "url":
    case "image":
      schema = "Schema.String.pipe(Schema.pattern(/^https?:\\/\\//))";
      break;
    case "phone":
      schema = "Schema.String.pipe(Schema.pattern(/^\\+?[0-9][0-9 ()-]{5,24}$/))";
      break;
    case "uuid":
      schema =
        "Schema.String.pipe(Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i))";
      break;
    case "date":
      schema = "Schema.String.pipe(Schema.pattern(/^\\d{4}-\\d{2}-\\d{2}$/))";
      break;
    case "time":
      schema = "Schema.String.pipe(Schema.pattern(/^\\d{2}:\\d{2}(?::\\d{2})?$/))";
      break;
    case "datetime":
      schema = "Schema.DateTimeUtc";
      break;
    case "string":
    case "markdown":
    case "html":
    case "csv":
    case "code":
    case "password": {
      const filters: Array<string> = [];
      if (Option.isSome(field.constraints.minLength))
        filters.push(`Schema.minLength(${field.constraints.minLength.value})`);
      if (Option.isSome(field.constraints.maxLength))
        filters.push(`Schema.maxLength(${field.constraints.maxLength.value})`);
      if (Option.isSome(field.constraints.pattern))
        filters.push(
          `Schema.pattern(compileRegularExpression(${quote(field.constraints.pattern.value)}))`,
        );
      schema = "Schema.String";
      if (filters.length > 0) schema = `${schema}.pipe(${filters.join(", ")})`;
    }
  }
  if (field.kind === "integer" || field.kind === "number") {
    const filters: Array<string> = [];
    if (Option.isSome(field.constraints.minimum))
      filters.push(`Schema.greaterThanOrEqualTo(${field.constraints.minimum.value})`);
    if (Option.isSome(field.constraints.maximum))
      filters.push(`Schema.lessThanOrEqualTo(${field.constraints.maximum.value})`);
    if (filters.length > 0) schema = `${schema}.pipe(${filters.join(", ")})`;
  }
  if (field.nullable) schema = `Schema.NullOr(${schema})`;
  if (!field.required) schema = `Schema.optionalWith(${schema}, { as: "Option" })`;
  return schema;
};

export const renderDataModels = (api: ApiIr): string =>
  api.resources
    .map((resource) => {
      const fields = resource.fields
        .filter(({ writeOnly }) => !writeOnly)
        .map((field) => `  ${field.name}: ${renderFieldSchema(field)},`)
        .join("\n");
      const writable = resource.fields
        .filter(({ readOnly }) => !readOnly)
        .map((field) => `  ${field.name}: ${renderFieldSchema(field)},`)
        .join("\n");
      return `export const ${pascalCase(resource.name)}Schema = Schema.Struct({\n${fields}\n});\nexport const ${pascalCase(resource.name)}Input = Schema.Struct({\n${writable}\n});`;
    })
    .join("\n\n");
