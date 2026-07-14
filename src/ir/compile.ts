import { Effect, ParseResult, Schema } from "effect";
import type { ApiContractV1, ContractField } from "../contract/schema.ts";
import { ContractValidationError } from "../domain/errors.ts";
import { RegularExpression } from "../libraries/regular-expression.ts";
import type {
  ApiIr,
  EditorKind,
  FieldConstraints,
  FieldIr,
  PaginationIr,
  ResourceIr,
} from "./model.ts";
import { ApiIrSchema } from "./model.ts";

const decodeApiIr = Schema.decodeUnknown(ApiIrSchema, {
  errors: "all",
  onExcessProperty: "error",
});

const duplicates = (values: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
};

const editorFor = (field: ContractField): EditorKind => {
  switch (field.type) {
    case "string":
      return field.multiline === true || (field.maxLength !== undefined && field.maxLength > 160)
        ? "textarea"
        : "text";
    case "markdown":
      return "markdown";
    case "html":
      return "richText";
    case "csv":
      return "table";
    case "url":
      return "url";
    case "email":
      return "email";
    case "date":
      return "date";
    case "time":
      return "time";
    case "datetime":
      return "datetime";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "checkbox";
    case "enum":
      return "select";
    case "reference":
      return "resourceSelect";
  }
};

const fieldToIr = (field: ContractField): FieldIr => {
  const constraints: {
    -readonly [Key in keyof FieldConstraints]?: FieldConstraints[Key];
  } = {};
  if ("minLength" in field && field.minLength !== undefined)
    constraints.minLength = field.minLength;
  if ("maxLength" in field && field.maxLength !== undefined)
    constraints.maxLength = field.maxLength;
  if ("pattern" in field && field.pattern !== undefined) constraints.pattern = field.pattern;
  if ("minimum" in field && field.minimum !== undefined) constraints.minimum = field.minimum;
  if ("maximum" in field && field.maximum !== undefined) constraints.maximum = field.maximum;

  return {
    name: field.name,
    label: field.label,
    ...(field.description === undefined ? {} : { description: field.description }),
    kind: field.type,
    editor: editorFor(field),
    required: field.required,
    readOnly: field.readOnly ?? false,
    nullable: field.nullable ?? false,
    constraints,
    enumValues: field.type === "enum" ? field.values : [],
    ...(field.type === "reference"
      ? { referencedResource: field.resource, referenceValueKind: field.valueType }
      : {}),
  };
};

const paginationToIr = (
  pagination:
    | ApiContractV1["resources"][number]["operations"]["list"]
    | ApiContractV1["resources"][number]["operations"]["search"],
): PaginationIr => {
  if (pagination === undefined) return { type: "none" };
  const value = pagination.pagination;
  switch (value.type) {
    case "none":
      return { type: "none" };
    case "offset":
      return {
        type: "offset",
        offsetParameter: value.offsetParameter,
        limitParameter: value.limitParameter,
        defaultLimit: value.defaultLimit,
      };
    case "cursor":
      return {
        type: "cursor",
        cursorParameter: value.cursorParameter,
        limitParameter: value.limitParameter,
        nextCursorPath: value.nextCursorPath,
        itemsPath: value.itemsPath,
        defaultLimit: value.defaultLimit,
      };
    case "page":
      return {
        type: "page",
        pageParameter: value.pageParameter,
        sizeParameter: value.sizeParameter,
        defaultSize: value.defaultSize,
      };
  }
};

const validateSemantics = (
  contract: ApiContractV1,
): Effect.Effect<void, ContractValidationError, RegularExpression> =>
  Effect.gen(function* () {
    const regularExpression = yield* RegularExpression;
    const duplicateResources = duplicates(contract.resources.map(({ name }) => name));
    if (duplicateResources.length > 0) {
      return yield* new ContractValidationError({
        message: `Duplicate resource names: ${duplicateResources.join(", ")}`,
      });
    }

    const resources = new Map(contract.resources.map((resource) => [resource.name, resource]));
    for (const resource of contract.resources) {
      const duplicateFields = duplicates(resource.fields.map(({ name }) => name));
      if (duplicateFields.length > 0) {
        return yield* new ContractValidationError({
          message: `Duplicate fields on ${resource.name}: ${duplicateFields.join(", ")}`,
        });
      }
      const fieldNames = new Set(resource.fields.map(({ name }) => name));
      if (!fieldNames.has(resource.idField)) {
        return yield* new ContractValidationError({
          message: `Resource ${resource.name} has unknown idField ${resource.idField}`,
        });
      }
      for (const field of resource.fields) {
        if ("pattern" in field && field.pattern !== undefined) {
          const pattern = field.pattern;
          yield* regularExpression.compile(pattern).pipe(
            Effect.mapError(
              (cause) =>
                new ContractValidationError({
                  message: `Field ${resource.name}.${field.name} has an invalid regular expression`,
                  cause,
                }),
            ),
          );
        }
        if (field.type === "reference" && !resources.has(field.resource)) {
          return yield* new ContractValidationError({
            message: `Field ${resource.name}.${field.name} references unknown resource ${field.resource}`,
          });
        }
      }
      for (const relationship of resource.relationships) {
        const target = resources.get(relationship.resource);
        if (target === undefined) {
          return yield* new ContractValidationError({
            message: `Relationship ${resource.name}.${relationship.name} targets unknown resource ${relationship.resource}`,
          });
        }
        if (!fieldNames.has(relationship.localField)) {
          return yield* new ContractValidationError({
            message: `Relationship ${resource.name}.${relationship.name} has unknown localField ${relationship.localField}`,
          });
        }
        if (!target.fields.some(({ name }) => name === relationship.foreignField)) {
          return yield* new ContractValidationError({
            message: `Relationship ${resource.name}.${relationship.name} has unknown foreignField ${relationship.foreignField}`,
          });
        }
      }
    }
  });

const resourceToIr = (resource: ApiContractV1["resources"][number]): ResourceIr => ({
  name: resource.name,
  singularLabel: resource.singularLabel,
  pluralLabel: resource.pluralLabel,
  idField: resource.idField,
  fields: resource.fields.map(fieldToIr),
  operations: {
    ...(resource.operations.list === undefined
      ? {}
      : {
          list: {
            method: resource.operations.list.method,
            path: resource.operations.list.path,
            pagination: paginationToIr(resource.operations.list),
          },
        }),
    ...(resource.operations.get === undefined ? {} : { get: resource.operations.get }),
    ...(resource.operations.create === undefined ? {} : { create: resource.operations.create }),
    ...(resource.operations.update === undefined ? {} : { update: resource.operations.update }),
    ...(resource.operations.delete === undefined ? {} : { delete: resource.operations.delete }),
    ...(resource.operations.search === undefined
      ? {}
      : {
          search: {
            method: resource.operations.search.method,
            path: resource.operations.search.path,
            queryParameter: resource.operations.search.queryParameter,
            pagination: paginationToIr(resource.operations.search),
          },
        }),
  },
  relationships: resource.relationships,
});

export const compileContract = (
  contract: ApiContractV1,
): Effect.Effect<ApiIr, ContractValidationError, RegularExpression> =>
  validateSemantics(contract).pipe(
    Effect.flatMap(() =>
      decodeApiIr({
        schemaVersion: contract.schemaVersion,
        api: {
          name: contract.api.name,
          ...(contract.api.description === undefined
            ? {}
            : { description: contract.api.description }),
          baseUrl: contract.api.baseUrl,
          auth: contract.api.auth,
        },
        resources: contract.resources.map(resourceToIr),
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ContractValidationError({
              message: `Internal representation validation failed: ${ParseResult.TreeFormatter.formatErrorSync(cause)}`,
              cause,
            }),
        ),
      ),
    ),
  );
