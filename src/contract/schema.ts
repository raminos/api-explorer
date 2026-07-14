import { Schema } from "effect";

const Identifier = Schema.String.pipe(
  Schema.pattern(/^[a-z][a-zA-Z0-9]*$/),
  Schema.annotations({ description: "A lower-camel-case identifier" }),
);

const CommonField = {
  name: Identifier,
  label: Schema.String.pipe(Schema.minLength(1)),
  description: Schema.optionalWith(Schema.String, { as: "Option" }),
  required: Schema.Boolean,
  readOnly: Schema.optionalWith(Schema.Boolean, { as: "Option" }),
  writeOnly: Schema.optionalWith(Schema.Boolean, { as: "Option" }),
  nullable: Schema.optionalWith(Schema.Boolean, { as: "Option" }),
};

const TextConstraints = {
  minLength: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.nonNegative()), {
    as: "Option",
  }),
  maxLength: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.positive()), {
    as: "Option",
  }),
  pattern: Schema.optionalWith(Schema.String, { as: "Option" }),
};

const TextField = Schema.Struct({
  ...CommonField,
  type: Schema.Literal("string", "markdown", "html", "csv"),
  ...TextConstraints,
  multiline: Schema.optionalWith(Schema.Boolean, { as: "Option" }),
});

const CodeField = Schema.Struct({
  ...CommonField,
  type: Schema.Literal("code"),
  ...TextConstraints,
  language: Schema.optionalWith(Schema.NonEmptyTrimmedString, { as: "Option" }),
});

const FormattedTextField = Schema.Struct({
  ...CommonField,
  type: Schema.Literal("url", "email", "phone", "password", "image", "uuid"),
  ...TextConstraints,
});

const TemporalField = Schema.Struct({
  ...CommonField,
  type: Schema.Literal("date", "time", "datetime"),
});

const NumberField = Schema.Struct({
  ...CommonField,
  type: Schema.Literal("integer", "number"),
  minimum: Schema.optionalWith(Schema.Number, { as: "Option" }),
  maximum: Schema.optionalWith(Schema.Number, { as: "Option" }),
});

const BooleanField = Schema.Struct({ ...CommonField, type: Schema.Literal("boolean") });

const EnumField = Schema.Struct({
  ...CommonField,
  type: Schema.Literal("enum"),
  values: Schema.Array(
    Schema.Struct({ value: Schema.String.pipe(Schema.minLength(1)), label: Schema.String }),
  ).pipe(Schema.minItems(1)),
});

const ReferenceField = Schema.Struct({
  ...CommonField,
  type: Schema.Literal("reference"),
  resource: Identifier,
  valueType: Schema.Literal("string", "integer"),
});

const ArrayElementSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("string", "integer", "number", "boolean", "url", "email", "phone", "uuid"),
  }),
  Schema.Struct({
    type: Schema.Literal("enum"),
    values: Schema.Array(
      Schema.Struct({ value: Schema.String.pipe(Schema.minLength(1)), label: Schema.String }),
    ).pipe(Schema.minItems(1)),
  }),
  Schema.Struct({
    type: Schema.Literal("reference"),
    resource: Identifier,
    valueType: Schema.Literal("string", "integer"),
  }),
);

const ArrayField = Schema.Struct({
  ...CommonField,
  type: Schema.Literal("array"),
  items: ArrayElementSchema,
  minItems: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.nonNegative()), {
    as: "Option",
  }),
  maxItems: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.positive()), {
    as: "Option",
  }),
  uniqueItems: Schema.optionalWith(Schema.Boolean, { as: "Option" }),
});

export const FieldSchema = Schema.Union(
  TextField,
  CodeField,
  FormattedTextField,
  TemporalField,
  NumberField,
  BooleanField,
  EnumField,
  ReferenceField,
  ArrayField,
);

const ResponseItemsSchema = Schema.Struct({
  itemsPath: Schema.NonEmptyTrimmedString,
});

const PaginationSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("none"),
    response: ResponseItemsSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("offset"),
    offsetParameter: Schema.String,
    limitParameter: Schema.String,
    defaultLimit: Schema.Number.pipe(Schema.int(), Schema.positive()),
    response: Schema.Struct({
      ...ResponseItemsSchema.fields,
      end: Schema.Union(
        Schema.Struct({ type: Schema.Literal("shortPage") }),
        Schema.Struct({
          type: Schema.Literal("totalItems"),
          totalItemsPath: Schema.NonEmptyTrimmedString,
        }),
      ),
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("cursor"),
    cursorParameter: Schema.String,
    limitParameter: Schema.String,
    nextCursorPath: Schema.String,
    defaultLimit: Schema.Number.pipe(Schema.int(), Schema.positive()),
    response: ResponseItemsSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("page"),
    pageParameter: Schema.String,
    sizeParameter: Schema.String,
    defaultSize: Schema.Number.pipe(Schema.int(), Schema.positive()),
    firstPage: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
    response: Schema.Struct({
      ...ResponseItemsSchema.fields,
      totalPagesPath: Schema.NonEmptyTrimmedString,
    }),
  }),
);

const OperationSchema = Schema.Struct({
  method: Schema.Literal("GET", "POST", "PUT", "PATCH", "DELETE"),
  path: Schema.String.pipe(Schema.startsWith("/")),
});

const ListOperationSchema = Schema.Struct({
  method: Schema.Literal("GET"),
  path: Schema.String.pipe(Schema.startsWith("/")),
  pagination: PaginationSchema,
});

const SearchOperationSchema = Schema.Struct({
  method: Schema.Literal("GET"),
  path: Schema.String.pipe(Schema.startsWith("/")),
  queryParameter: Schema.String.pipe(Schema.minLength(1)),
  pagination: PaginationSchema,
});

const RelationshipSchema = Schema.Struct({
  name: Identifier,
  kind: Schema.Literal("belongsTo", "hasMany"),
  resource: Identifier,
  localField: Identifier,
  foreignField: Identifier,
});

const ResourceSchema = Schema.Struct({
  name: Identifier,
  singularLabel: Schema.String.pipe(Schema.minLength(1)),
  pluralLabel: Schema.String.pipe(Schema.minLength(1)),
  idField: Identifier,
  fields: Schema.Array(FieldSchema).pipe(Schema.minItems(1)),
  operations: Schema.Struct({
    list: Schema.optionalWith(ListOperationSchema, { as: "Option" }),
    get: Schema.optionalWith(OperationSchema, { as: "Option" }),
    create: Schema.optionalWith(OperationSchema, { as: "Option" }),
    update: Schema.optionalWith(OperationSchema, { as: "Option" }),
    delete: Schema.optionalWith(OperationSchema, { as: "Option" }),
    search: Schema.optionalWith(SearchOperationSchema, { as: "Option" }),
  }),
  relationships: Schema.optionalWith(Schema.Array(RelationshipSchema), { default: () => [] }),
});

const AuthSchema = Schema.Union(
  Schema.Struct({ type: Schema.Literal("none") }),
  Schema.Struct({
    type: Schema.Literal("apiKey"),
    location: Schema.Literal("header", "query"),
    name: Schema.String.pipe(Schema.minLength(1)),
    environmentVariable: Schema.String.pipe(Schema.pattern(/^[A-Z][A-Z0-9_]*$/)),
  }),
  Schema.Struct({
    type: Schema.Literal("bearer"),
    environmentVariable: Schema.String.pipe(Schema.pattern(/^[A-Z][A-Z0-9_]*$/)),
  }),
);

const HeaderSchema = Schema.Union(
  Schema.Struct({
    name: Schema.NonEmptyTrimmedString,
    source: Schema.Literal("literal"),
    value: Schema.String,
  }),
  Schema.Struct({
    name: Schema.NonEmptyTrimmedString,
    source: Schema.Literal("environment"),
    environmentVariable: Schema.String.pipe(Schema.pattern(/^[A-Z][A-Z0-9_]*$/)),
  }),
);

export const ApiContractV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal("1.0"),
  api: Schema.Struct({
    name: Schema.String.pipe(Schema.minLength(1)),
    description: Schema.optionalWith(Schema.String, { as: "Option" }),
    baseUrl: Schema.String.pipe(Schema.startsWith("https://")),
    auth: AuthSchema,
    headers: Schema.optionalWith(Schema.Array(HeaderSchema), { default: () => [] }),
  }),
  resources: Schema.Array(ResourceSchema).pipe(Schema.minItems(1)),
});

export type ApiContractV1 = typeof ApiContractV1Schema.Type;
export type ContractField = typeof FieldSchema.Type;
