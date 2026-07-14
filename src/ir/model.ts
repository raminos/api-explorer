import { Schema } from "effect";

export const FieldKindSchema = Schema.Literal(
  "string",
  "markdown",
  "html",
  "csv",
  "code",
  "url",
  "email",
  "phone",
  "password",
  "image",
  "uuid",
  "date",
  "time",
  "datetime",
  "integer",
  "number",
  "boolean",
  "enum",
  "reference",
  "array",
);
export type FieldKind = typeof FieldKindSchema.Type;

export const EditorKindSchema = Schema.Literal(
  "text",
  "textarea",
  "markdown",
  "richText",
  "table",
  "code",
  "url",
  "email",
  "phone",
  "password",
  "image",
  "uuid",
  "date",
  "time",
  "datetime",
  "number",
  "checkbox",
  "select",
  "resourceSelect",
  "multiSelect",
  "resourceMultiSelect",
  "repeatable",
);
export type EditorKind = typeof EditorKindSchema.Type;

export const FieldConstraintsSchema = Schema.Struct({
  minLength: Schema.OptionFromSelf(Schema.Number.pipe(Schema.int(), Schema.nonNegative())),
  maxLength: Schema.OptionFromSelf(Schema.Number.pipe(Schema.int(), Schema.positive())),
  pattern: Schema.OptionFromSelf(Schema.String),
  minimum: Schema.OptionFromSelf(Schema.Number),
  maximum: Schema.OptionFromSelf(Schema.Number),
  minItems: Schema.OptionFromSelf(Schema.Number.pipe(Schema.int(), Schema.nonNegative())),
  maxItems: Schema.OptionFromSelf(Schema.Number.pipe(Schema.int(), Schema.positive())),
  uniqueItems: Schema.Boolean,
});
export type FieldConstraints = typeof FieldConstraintsSchema.Type;

export const ArrayElementIrSchema = Schema.Struct({
  kind: Schema.Literal(
    "string",
    "integer",
    "number",
    "boolean",
    "url",
    "email",
    "phone",
    "uuid",
    "enum",
    "reference",
  ),
  enumValues: Schema.Array(Schema.Struct({ value: Schema.String, label: Schema.String })),
  referencedResource: Schema.OptionFromSelf(Schema.String),
  referenceValueKind: Schema.OptionFromSelf(Schema.Literal("string", "integer")),
});
export type ArrayElementIr = typeof ArrayElementIrSchema.Type;

export const FieldIrSchema = Schema.Struct({
  name: Schema.String,
  label: Schema.String,
  description: Schema.OptionFromSelf(Schema.String),
  kind: FieldKindSchema,
  editor: EditorKindSchema,
  required: Schema.Boolean,
  readOnly: Schema.Boolean,
  writeOnly: Schema.Boolean,
  nullable: Schema.Boolean,
  constraints: FieldConstraintsSchema,
  enumValues: Schema.Array(Schema.Struct({ value: Schema.String, label: Schema.String })),
  referencedResource: Schema.OptionFromSelf(Schema.String),
  referenceValueKind: Schema.OptionFromSelf(Schema.Literal("string", "integer")),
  language: Schema.OptionFromSelf(Schema.String),
  arrayElement: Schema.OptionFromSelf(ArrayElementIrSchema),
});
export type FieldIr = typeof FieldIrSchema.Type;

export const OperationIrSchema = Schema.Struct({
  method: Schema.Literal("GET", "POST", "PUT", "PATCH", "DELETE"),
  path: Schema.String,
});
export type OperationIr = typeof OperationIrSchema.Type;

export const PaginationIrSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("none"),
    response: Schema.Struct({ itemsPath: Schema.String }),
  }),
  Schema.Struct({
    type: Schema.Literal("offset"),
    offsetParameter: Schema.String,
    limitParameter: Schema.String,
    defaultLimit: Schema.Number.pipe(Schema.int(), Schema.positive()),
    response: Schema.Struct({
      itemsPath: Schema.String,
      end: Schema.Union(
        Schema.Struct({ type: Schema.Literal("shortPage") }),
        Schema.Struct({ type: Schema.Literal("totalItems"), totalItemsPath: Schema.String }),
      ),
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("cursor"),
    cursorParameter: Schema.String,
    limitParameter: Schema.String,
    nextCursorPath: Schema.String,
    defaultLimit: Schema.Number.pipe(Schema.int(), Schema.positive()),
    response: Schema.Struct({ itemsPath: Schema.String }),
  }),
  Schema.Struct({
    type: Schema.Literal("page"),
    pageParameter: Schema.String,
    sizeParameter: Schema.String,
    defaultSize: Schema.Number.pipe(Schema.int(), Schema.positive()),
    firstPage: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
    response: Schema.Struct({
      itemsPath: Schema.String,
      end: Schema.Union(
        Schema.Struct({ type: Schema.Literal("shortPage") }),
        Schema.Struct({ type: Schema.Literal("totalPages"), totalPagesPath: Schema.String }),
      ),
    }),
  }),
);
export type PaginationIr = typeof PaginationIrSchema.Type;

const ListOperationIrSchema = Schema.Struct({
  ...OperationIrSchema.fields,
  pagination: PaginationIrSchema,
});

const SearchOperationIrSchema = Schema.Struct({
  ...OperationIrSchema.fields,
  queryParameter: Schema.String,
  pagination: PaginationIrSchema,
});

export const RelationshipIrSchema = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literal("belongsTo", "hasMany"),
  resource: Schema.String,
  localField: Schema.String,
  foreignField: Schema.String,
});

export const ResourceIrSchema = Schema.Struct({
  name: Schema.String,
  singularLabel: Schema.String,
  pluralLabel: Schema.String,
  idField: Schema.String,
  fields: Schema.Array(FieldIrSchema),
  operations: Schema.Struct({
    list: Schema.OptionFromSelf(ListOperationIrSchema),
    get: Schema.OptionFromSelf(OperationIrSchema),
    create: Schema.OptionFromSelf(OperationIrSchema),
    update: Schema.OptionFromSelf(OperationIrSchema),
    delete: Schema.OptionFromSelf(OperationIrSchema),
    search: Schema.OptionFromSelf(SearchOperationIrSchema),
  }),
  relationships: Schema.Array(RelationshipIrSchema),
});
export type ResourceIr = typeof ResourceIrSchema.Type;

export const AuthIrSchema = Schema.Union(
  Schema.Struct({ type: Schema.Literal("none") }),
  Schema.Struct({
    type: Schema.Literal("apiKey"),
    location: Schema.Literal("header", "query"),
    name: Schema.String,
    environmentVariable: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("bearer"),
    environmentVariable: Schema.String,
  }),
);

export const HeaderIrSchema = Schema.Union(
  Schema.Struct({ name: Schema.String, source: Schema.Literal("literal"), value: Schema.String }),
  Schema.Struct({
    name: Schema.String,
    source: Schema.Literal("environment"),
    environmentVariable: Schema.String,
  }),
);

export const ApiIrSchema = Schema.Struct({
  schemaVersion: Schema.Literal("1.0"),
  api: Schema.Struct({
    name: Schema.String,
    description: Schema.OptionFromSelf(Schema.String),
    baseUrl: Schema.String,
    auth: AuthIrSchema,
    headers: Schema.Array(HeaderIrSchema),
  }),
  resources: Schema.Array(ResourceIrSchema),
});
export type ApiIr = typeof ApiIrSchema.Type;
