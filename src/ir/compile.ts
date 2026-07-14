import { Effect, HashMap, HashSet, Option, ParseResult, Schema } from "effect";
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
  let seen = HashSet.empty<string>();
  let repeated = HashSet.empty<string>();
  for (const value of values) {
    if (HashSet.has(seen, value)) repeated = HashSet.add(repeated, value);
    seen = HashSet.add(seen, value);
  }
  return [...HashSet.values(repeated)];
};

const editorFor = (field: ContractField): EditorKind => {
  switch (field.type) {
    case "string":
      return Option.getOrElse(field.multiline, () => false) ||
        Option.exists(field.maxLength, (maximum) => maximum > 160)
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
  const constraints: FieldConstraints = {
    minLength: "minLength" in field ? field.minLength : Option.none(),
    maxLength: "maxLength" in field ? field.maxLength : Option.none(),
    pattern: "pattern" in field ? field.pattern : Option.none(),
    minimum: "minimum" in field ? field.minimum : Option.none(),
    maximum: "maximum" in field ? field.maximum : Option.none(),
  };

  return {
    name: field.name,
    label: field.label,
    description: field.description,
    kind: field.type,
    editor: editorFor(field),
    required: field.required,
    readOnly: Option.getOrElse(field.readOnly, () => false),
    nullable: Option.getOrElse(field.nullable, () => false),
    constraints,
    enumValues: field.type === "enum" ? field.values : [],
    referencedResource: field.type === "reference" ? Option.some(field.resource) : Option.none(),
    referenceValueKind: field.type === "reference" ? Option.some(field.valueType) : Option.none(),
  };
};

type ListOperation = Option.Option.Value<ApiContractV1["resources"][number]["operations"]["list"]>;
type SearchOperation = Option.Option.Value<
  ApiContractV1["resources"][number]["operations"]["search"]
>;

const paginationToIr = (pagination: ListOperation | SearchOperation): PaginationIr => {
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
        cause: Option.none(),
      });
    }

    const resources = HashMap.fromIterable(
      contract.resources.map((resource) => [resource.name, resource] as const),
    );
    for (const resource of contract.resources) {
      const duplicateFields = duplicates(resource.fields.map(({ name }) => name));
      if (duplicateFields.length > 0) {
        return yield* new ContractValidationError({
          message: `Duplicate fields on ${resource.name}: ${duplicateFields.join(", ")}`,
          cause: Option.none(),
        });
      }
      const fieldNames = HashSet.fromIterable(resource.fields.map(({ name }) => name));
      if (!HashSet.has(fieldNames, resource.idField)) {
        return yield* new ContractValidationError({
          message: `Resource ${resource.name} has unknown idField ${resource.idField}`,
          cause: Option.none(),
        });
      }
      for (const field of resource.fields) {
        if ("pattern" in field && Option.isSome(field.pattern)) {
          yield* regularExpression.compile(field.pattern.value).pipe(
            Effect.mapError(
              (cause) =>
                new ContractValidationError({
                  message: `Field ${resource.name}.${field.name} has an invalid regular expression`,
                  cause: Option.some(cause),
                }),
            ),
          );
        }
        if (field.type === "reference" && !HashMap.has(resources, field.resource)) {
          return yield* new ContractValidationError({
            message: `Field ${resource.name}.${field.name} references unknown resource ${field.resource}`,
            cause: Option.none(),
          });
        }
      }
      for (const relationship of resource.relationships) {
        const target = HashMap.get(resources, relationship.resource);
        if (Option.isNone(target)) {
          return yield* new ContractValidationError({
            message: `Relationship ${resource.name}.${relationship.name} targets unknown resource ${relationship.resource}`,
            cause: Option.none(),
          });
        }
        if (!HashSet.has(fieldNames, relationship.localField)) {
          return yield* new ContractValidationError({
            message: `Relationship ${resource.name}.${relationship.name} has unknown localField ${relationship.localField}`,
            cause: Option.none(),
          });
        }
        if (!target.value.fields.some(({ name }) => name === relationship.foreignField)) {
          return yield* new ContractValidationError({
            message: `Relationship ${resource.name}.${relationship.name} has unknown foreignField ${relationship.foreignField}`,
            cause: Option.none(),
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
    list: Option.map(resource.operations.list, (operation) => ({
      method: operation.method,
      path: operation.path,
      pagination: paginationToIr(operation),
    })),
    get: resource.operations.get,
    create: resource.operations.create,
    update: resource.operations.update,
    delete: resource.operations.delete,
    search: Option.map(resource.operations.search, (operation) => ({
      method: operation.method,
      path: operation.path,
      queryParameter: operation.queryParameter,
      pagination: paginationToIr(operation),
    })),
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
          description: contract.api.description,
          baseUrl: contract.api.baseUrl,
          auth: contract.api.auth,
        },
        resources: contract.resources.map(resourceToIr),
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ContractValidationError({
              message: `Internal representation validation failed: ${ParseResult.TreeFormatter.formatErrorSync(cause)}`,
              cause: Option.some(cause),
            }),
        ),
      ),
    ),
  );
