import { Effect, Array as EffectArray, HashSet, Option, ParseResult, Schema } from "effect";
import { GenerationError } from "../domain/errors.ts";
import type { ApiIr, EditorKind, FieldKind } from "../ir/model.ts";
import { EditorKindSchema, FieldKindSchema } from "../ir/model.ts";

export const AdapterKindSchema = Schema.Literal("backend", "frontend");
export type AdapterKind = typeof AdapterKindSchema.Type;

export const AdapterIdSchema = Schema.NonEmptyTrimmedString.pipe(
  Schema.pattern(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
);
export type AdapterId = typeof AdapterIdSchema.Type;

export const AdapterMetadataSchema = Schema.Struct({
  id: AdapterIdSchema,
  kind: AdapterKindSchema,
  displayName: Schema.NonEmptyTrimmedString,
  description: Schema.NonEmptyTrimmedString,
});
export type AdapterMetadata = typeof AdapterMetadataSchema.Type;

export const GeneratedFileSchema = Schema.Struct({
  path: Schema.NonEmptyTrimmedString.pipe(
    Schema.pattern(/^(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/),
  ),
  contents: Schema.String,
});
export type GeneratedFile = typeof GeneratedFileSchema.Type;

interface BaseAdapterCapabilities {
  readonly contractVersions: Readonly<{ readonly "1.0": true }>;
  readonly protocolVersions: Readonly<{ readonly "1.0": true }>;
  readonly fieldKinds: Readonly<Record<FieldKind, true>>;
}

export interface BackendAdapterCapabilities extends BaseAdapterCapabilities {
  readonly kind: "backend";
}

export interface FrontendAdapterCapabilities extends BaseAdapterCapabilities {
  readonly kind: "frontend";
  readonly editorKinds: Readonly<Record<EditorKind, true>>;
}

export type AdapterCapabilities = BackendAdapterCapabilities | FrontendAdapterCapabilities;

const BaseAdapterCapabilitiesFields = {
  contractVersions: Schema.Struct({ "1.0": Schema.Literal(true) }),
  protocolVersions: Schema.Struct({ "1.0": Schema.Literal(true) }),
  fieldKinds: Schema.Record({ key: FieldKindSchema, value: Schema.Literal(true) }),
};

const AdapterCapabilitiesSchema = Schema.Union(
  Schema.Struct({ ...BaseAdapterCapabilitiesFields, kind: Schema.Literal("backend") }),
  Schema.Struct({
    ...BaseAdapterCapabilitiesFields,
    kind: Schema.Literal("frontend"),
    editorKinds: Schema.Record({ key: EditorKindSchema, value: Schema.Literal(true) }),
  }),
);

export const AdapterPrimitiveMetadataSchema = Schema.Struct({
  id: AdapterIdSchema,
  description: Schema.NonEmptyTrimmedString,
});
export type AdapterPrimitiveMetadata = typeof AdapterPrimitiveMetadataSchema.Type;

export interface AdapterPrimitive {
  readonly metadata: AdapterPrimitiveMetadata;
  readonly render: (api: ApiIr) => Effect.Effect<ReadonlyArray<GeneratedFile>, GenerationError>;
}

export interface GeneratorAdapter<Units = unknown> {
  readonly metadata: AdapterMetadata;
  readonly capabilities: AdapterCapabilities;
  readonly units: Units;
  readonly primitives: readonly [AdapterPrimitive, ...ReadonlyArray<AdapterPrimitive>];
  readonly generate: (api: ApiIr) => Effect.Effect<ReadonlyArray<GeneratedFile>, GenerationError>;
}

const completeFieldKinds = {
  string: true,
  markdown: true,
  html: true,
  csv: true,
  code: true,
  url: true,
  email: true,
  phone: true,
  password: true,
  image: true,
  uuid: true,
  date: true,
  time: true,
  datetime: true,
  integer: true,
  number: true,
  boolean: true,
  enum: true,
  reference: true,
  array: true,
} as const;

const baseCompleteCapabilities = {
  contractVersions: { "1.0": true },
  protocolVersions: { "1.0": true },
  fieldKinds: completeFieldKinds,
} as const;

export const completeBackendCapabilities: BackendAdapterCapabilities = {
  ...baseCompleteCapabilities,
  kind: "backend",
};

export const completeFrontendCapabilities: FrontendAdapterCapabilities = {
  ...baseCompleteCapabilities,
  kind: "frontend",
  editorKinds: {
    text: true,
    textarea: true,
    markdown: true,
    richText: true,
    table: true,
    code: true,
    url: true,
    email: true,
    phone: true,
    password: true,
    image: true,
    uuid: true,
    date: true,
    time: true,
    datetime: true,
    number: true,
    checkbox: true,
    select: true,
    resourceSelect: true,
    multiSelect: true,
    resourceMultiSelect: true,
    repeatable: true,
  },
};

const decodeGeneratedFiles = Schema.decodeUnknown(Schema.Array(GeneratedFileSchema), {
  errors: "all",
  onExcessProperty: "error",
});

const generationError = (message: string, cause: unknown) =>
  new GenerationError({ message, cause: Option.some(cause) });

export const definePrimitive = (
  metadata: AdapterPrimitiveMetadata,
  render: AdapterPrimitive["render"],
): AdapterPrimitive => {
  const validatedMetadata = Schema.decodeUnknownSync(AdapterPrimitiveMetadataSchema)(metadata, {
    errors: "all",
    onExcessProperty: "error",
  });
  return {
    metadata: validatedMetadata,
    render: (api) =>
      render(api).pipe(
        Effect.flatMap(decodeGeneratedFiles),
        Effect.mapError((cause) =>
          cause._tag === "GenerationError"
            ? cause
            : generationError(
                `Primitive ${validatedMetadata.id} emitted invalid files: ${ParseResult.TreeFormatter.formatErrorSync(cause)}`,
                cause,
              ),
        ),
      ),
  };
};

const composePrimitives = (
  adapterId: AdapterId,
  primitives: readonly [AdapterPrimitive, ...ReadonlyArray<AdapterPrimitive>],
  api: ApiIr,
): Effect.Effect<ReadonlyArray<GeneratedFile>, GenerationError> =>
  Effect.gen(function* () {
    const groups = yield* Effect.forEach(primitives, ({ render }) => render(api), {
      concurrency: 1,
    });
    const files = EffectArray.flatten(groups);
    let paths = HashSet.empty<string>();
    for (const file of files) {
      if (HashSet.has(paths, file.path)) {
        return yield* generationError(
          `Adapter ${adapterId} emitted duplicate path ${file.path}`,
          file.path,
        );
      }
      paths = HashSet.add(paths, file.path);
    }
    return files;
  });

export const defineAdapter = <Units>(definition: {
  readonly metadata: AdapterMetadata;
  readonly capabilities: AdapterCapabilities;
  readonly units: Units;
  readonly primitives: readonly [AdapterPrimitive, ...ReadonlyArray<AdapterPrimitive>];
}): GeneratorAdapter<Units> => {
  const metadata = Schema.decodeUnknownSync(AdapterMetadataSchema)(definition.metadata, {
    errors: "all",
    onExcessProperty: "error",
  });
  const capabilities = Schema.decodeUnknownSync(AdapterCapabilitiesSchema)(
    definition.capabilities,
    { errors: "all", onExcessProperty: "error" },
  ) as AdapterCapabilities;
  if (metadata.kind !== capabilities.kind) {
    throw generationError(
      `Adapter ${metadata.id} metadata kind does not match its capabilities`,
      capabilities.kind,
    );
  }
  Schema.decodeUnknownSync(Schema.Array(AdapterPrimitiveMetadataSchema).pipe(Schema.minItems(1)))(
    definition.primitives.map(({ metadata: primitiveMetadata }) => primitiveMetadata),
    {
      errors: "all",
      onExcessProperty: "error",
    },
  );
  const primitiveIds = definition.primitives.map(
    ({ metadata: primitiveMetadata }) => primitiveMetadata.id,
  );
  if (HashSet.size(HashSet.fromIterable(primitiveIds)) !== primitiveIds.length) {
    throw generationError(`Adapter ${metadata.id} has duplicate primitive ids`, primitiveIds);
  }
  return {
    metadata,
    capabilities,
    units: definition.units,
    primitives: definition.primitives,
    generate: (api) => composePrimitives(metadata.id, definition.primitives, api),
  };
};
