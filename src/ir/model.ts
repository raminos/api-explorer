import { Schema } from "effect";

export const FieldKindSchema = Schema.Literal(
  "string",
  "markdown",
  "html",
  "csv",
  "url",
  "email",
  "date",
  "time",
  "datetime",
  "integer",
  "number",
  "boolean",
  "enum",
  "reference",
);
export type FieldKind = typeof FieldKindSchema.Type;

export const EditorKindSchema = Schema.Literal(
  "text",
  "textarea",
  "markdown",
  "richText",
  "table",
  "url",
  "email",
  "date",
  "time",
  "datetime",
  "number",
  "checkbox",
  "select",
  "resourceSelect",
);
export type EditorKind = typeof EditorKindSchema.Type;

export const FieldConstraintsSchema = Schema.Struct({
  minLength: Schema.OptionFromSelf(Schema.Number.pipe(Schema.int(), Schema.nonNegative())),
  maxLength: Schema.OptionFromSelf(Schema.Number.pipe(Schema.int(), Schema.positive())),
  pattern: Schema.OptionFromSelf(Schema.String),
  minimum: Schema.OptionFromSelf(Schema.Number),
  maximum: Schema.OptionFromSelf(Schema.Number),
});
export type FieldConstraints = typeof FieldConstraintsSchema.Type;

export const FieldIrSchema = Schema.Struct({
  name: Schema.String,
  label: Schema.String,
  description: Schema.OptionFromSelf(Schema.String),
  kind: FieldKindSchema,
  editor: EditorKindSchema,
  required: Schema.Boolean,
  readOnly: Schema.Boolean,
  nullable: Schema.Boolean,
  constraints: FieldConstraintsSchema,
  enumValues: Schema.Array(Schema.Struct({ value: Schema.String, label: Schema.String })),
  referencedResource: Schema.OptionFromSelf(Schema.String),
  referenceValueKind: Schema.OptionFromSelf(Schema.Literal("string", "integer")),
});
export type FieldIr = typeof FieldIrSchema.Type;

export const OperationIrSchema = Schema.Struct({
  method: Schema.Literal("GET", "POST", "PUT", "PATCH", "DELETE"),
  path: Schema.String,
});
export type OperationIr = typeof OperationIrSchema.Type;

export const PaginationIrSchema = Schema.Union(
  Schema.Struct({ type: Schema.Literal("none") }),
  Schema.Struct({
    type: Schema.Literal("offset"),
    offsetParameter: Schema.String,
    limitParameter: Schema.String,
    defaultLimit: Schema.Number.pipe(Schema.int(), Schema.positive()),
  }),
  Schema.Struct({
    type: Schema.Literal("cursor"),
    cursorParameter: Schema.String,
    limitParameter: Schema.String,
    nextCursorPath: Schema.String,
    itemsPath: Schema.String,
    defaultLimit: Schema.Number.pipe(Schema.int(), Schema.positive()),
  }),
  Schema.Struct({
    type: Schema.Literal("page"),
    pageParameter: Schema.String,
    sizeParameter: Schema.String,
    defaultSize: Schema.Number.pipe(Schema.int(), Schema.positive()),
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

export const ApiIrSchema = Schema.Struct({
  schemaVersion: Schema.Literal("1.0"),
  api: Schema.Struct({
    name: Schema.String,
    description: Schema.OptionFromSelf(Schema.String),
    baseUrl: Schema.String,
    auth: AuthIrSchema,
  }),
  resources: Schema.Array(ResourceIrSchema),
});
export type ApiIr = typeof ApiIrSchema.Type;
