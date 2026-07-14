import { Effect, Option, ParseResult, Schema } from "effect";
import { GenerationError } from "../domain/errors.ts";
import type { ApiIr, EditorKind, FieldIr, FieldKind, ResourceIr } from "../ir/model.ts";
import type { LibraryError } from "../libraries/errors.ts";
import type { Json } from "../libraries/json.ts";

export const GeneratedFileSchema = Schema.Struct({
  path: Schema.String.pipe(Schema.minLength(1)),
  contents: Schema.String,
});
export type GeneratedFile = typeof GeneratedFileSchema.Type;

export interface AdapterCapabilities {
  readonly contractVersions: Readonly<{ readonly "1.0": true }>;
  readonly fieldKinds: Readonly<Record<FieldKind, true>>;
  readonly editorKinds: Readonly<Record<EditorKind, true>>;
}

export interface BackendAdapterUnits {
  readonly renderFieldSchema: (field: FieldIr) => string;
  readonly renderDataModels: (api: ApiIr) => string;
  readonly renderDataTransfer: (resource: ResourceIr) => string;
  readonly renderEndpointManifest: (api: ApiIr) => Effect.Effect<string, LibraryError, Json>;
  readonly renderTransport: (api: ApiIr) => string;
}

export interface FrontendAdapterUnits {
  readonly renderDataTransfer: (resource: ResourceIr) => string;
  readonly renderResourceMetadata: (api: ApiIr) => Effect.Effect<string, LibraryError, Json>;
  readonly renderApiClient: () => string;
  readonly renderCreateUpdateForm: () => string;
  readonly renderResourceTable: () => string;
  readonly renderResourcePage: () => string;
  readonly renderApplication: () => string;
}

export interface GeneratorAdapter {
  readonly name: string;
  readonly capabilities: AdapterCapabilities;
  readonly units: BackendAdapterUnits | FrontendAdapterUnits;
  readonly generate: (
    api: ApiIr,
  ) => Effect.Effect<ReadonlyArray<GeneratedFile>, GenerationError, Json>;
}

export const completeCapabilities: AdapterCapabilities = {
  contractVersions: { "1.0": true },
  fieldKinds: {
    string: true,
    markdown: true,
    html: true,
    csv: true,
    url: true,
    email: true,
    date: true,
    time: true,
    datetime: true,
    integer: true,
    number: true,
    boolean: true,
    enum: true,
    reference: true,
  },
  editorKinds: {
    text: true,
    textarea: true,
    markdown: true,
    richText: true,
    table: true,
    url: true,
    email: true,
    date: true,
    time: true,
    datetime: true,
    number: true,
    checkbox: true,
    select: true,
    resourceSelect: true,
  },
};

const decodeGeneratedFiles = Schema.decodeUnknown(Schema.Array(GeneratedFileSchema), {
  errors: "all",
  onExcessProperty: "error",
});

export const defineAdapter = <Adapter extends GeneratorAdapter>(adapter: Adapter): Adapter =>
  ({
    ...adapter,
    generate: (api) =>
      adapter.generate(api).pipe(
        Effect.flatMap(decodeGeneratedFiles),
        Effect.mapError((cause) => {
          if (cause._tag === "GenerationError") return cause;
          return new GenerationError({
            message: `Adapter ${adapter.name} emitted invalid files: ${ParseResult.TreeFormatter.formatErrorSync(cause)}`,
            cause: Option.some(cause),
          });
        }),
      ),
  }) as Adapter;
