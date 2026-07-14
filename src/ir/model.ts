export type FieldKind =
  | "string"
  | "markdown"
  | "html"
  | "csv"
  | "url"
  | "email"
  | "date"
  | "time"
  | "datetime"
  | "integer"
  | "number"
  | "boolean"
  | "enum"
  | "reference";

export type EditorKind =
  | "text"
  | "textarea"
  | "markdown"
  | "richText"
  | "table"
  | "url"
  | "email"
  | "date"
  | "time"
  | "datetime"
  | "number"
  | "checkbox"
  | "select"
  | "resourceSelect";

export interface FieldConstraints {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface FieldIr {
  readonly name: string;
  readonly label: string;
  readonly description: string | undefined;
  readonly kind: FieldKind;
  readonly editor: EditorKind;
  readonly required: boolean;
  readonly readOnly: boolean;
  readonly nullable: boolean;
  readonly constraints: FieldConstraints;
  readonly enumValues: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  readonly referencedResource: string | undefined;
  readonly referenceValueKind: "string" | "integer" | undefined;
}

export interface OperationIr {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
}

export interface PaginationIr {
  readonly type: "none" | "offset" | "cursor" | "page";
  readonly parameters: Readonly<Record<string, number | string>>;
}

export interface ResourceIr {
  readonly name: string;
  readonly singularLabel: string;
  readonly pluralLabel: string;
  readonly idField: string;
  readonly fields: ReadonlyArray<FieldIr>;
  readonly operations: {
    readonly list?: OperationIr & { readonly pagination: PaginationIr };
    readonly get?: OperationIr;
    readonly create?: OperationIr;
    readonly update?: OperationIr;
    readonly delete?: OperationIr;
    readonly search?: OperationIr & {
      readonly queryParameter: string;
      readonly pagination: PaginationIr;
    };
  };
  readonly relationships: ReadonlyArray<{
    readonly name: string;
    readonly kind: "belongsTo" | "hasMany";
    readonly resource: string;
    readonly localField: string;
    readonly foreignField: string;
  }>;
}

export interface ApiIr {
  readonly schemaVersion: "1.0";
  readonly api: {
    readonly name: string;
    readonly description: string | undefined;
    readonly baseUrl: string;
    readonly auth:
      | { readonly type: "none" }
      | {
          readonly type: "apiKey";
          readonly location: "header" | "query";
          readonly name: string;
          readonly environmentVariable: string;
        }
      | { readonly type: "bearer"; readonly environmentVariable: string };
  };
  readonly resources: ReadonlyArray<ResourceIr>;
}
