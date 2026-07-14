import { Effect, Array as EffectArray, HashSet, Option, Schema } from "effect";
import { builtInAdapters } from "../adapters/index.ts";
import { GenerationError } from "../domain/errors.ts";
import {
  AdapterIdSchema,
  type AdapterKind,
  type GeneratedFile,
  type GeneratorAdapter,
} from "../generator/adapter.ts";
import type { ApiIr } from "../ir/model.ts";

export const GenerationTargetSchema = Schema.Literal("all", "server", "web");
export type GenerationTarget = typeof GenerationTargetSchema.Type;

export const AdapterSelectionSchema = Schema.Struct({
  target: GenerationTargetSchema,
  backendAdapter: AdapterIdSchema,
  frontendAdapter: AdapterIdSchema,
});
export type AdapterSelection = typeof AdapterSelectionSchema.Type;

export interface AdapterRegistryApi {
  readonly adapters: (kind: AdapterKind) => ReadonlyArray<GeneratorAdapter>;
  readonly generate: (
    selection: AdapterSelection,
    api: ApiIr,
  ) => Effect.Effect<ReadonlyArray<GeneratedFile>, GenerationError>;
}

const selectionError = (message: string) => new GenerationError({ message, cause: Option.none() });

export const makeAdapterRegistry = (
  adapters: ReadonlyArray<GeneratorAdapter>,
): AdapterRegistryApi => {
  const ids = adapters.map(({ metadata }) => metadata.id);
  if (HashSet.size(HashSet.fromIterable(ids)) !== ids.length) {
    throw selectionError("Adapter registry contains duplicate adapter ids");
  }

  const find = (id: string, kind: AdapterKind) =>
    EffectArray.findFirst(adapters, ({ metadata }) => metadata.id === id && metadata.kind === kind);

  const selectedAdapters = (
    selection: AdapterSelection,
  ): Effect.Effect<ReadonlyArray<GeneratorAdapter>, GenerationError> => {
    const backend = find(selection.backendAdapter, "backend");
    const frontend = find(selection.frontendAdapter, "frontend");
    switch (selection.target) {
      case "server":
        return Option.match(backend, {
          onNone: () =>
            Effect.fail(selectionError(`Unknown backend adapter ${selection.backendAdapter}`)),
          onSome: (adapter) => Effect.succeed([adapter]),
        });
      case "web":
        return Option.match(frontend, {
          onNone: () =>
            Effect.fail(selectionError(`Unknown frontend adapter ${selection.frontendAdapter}`)),
          onSome: (adapter) => Effect.succeed([adapter]),
        });
      case "all":
        if (Option.isNone(backend)) {
          return Effect.fail(selectionError(`Unknown backend adapter ${selection.backendAdapter}`));
        }
        if (Option.isNone(frontend)) {
          return Effect.fail(
            selectionError(`Unknown frontend adapter ${selection.frontendAdapter}`),
          );
        }
        if (
          !backend.value.capabilities.protocolVersions["1.0"] ||
          !frontend.value.capabilities.protocolVersions["1.0"]
        ) {
          return Effect.fail(
            selectionError(
              `Adapters ${backend.value.metadata.id} and ${frontend.value.metadata.id} do not share explorer protocol 1.0`,
            ),
          );
        }
        return Effect.succeed([backend.value, frontend.value]);
    }
  };

  return {
    adapters: (kind) => adapters.filter(({ metadata }) => metadata.kind === kind),
    generate: (selection, api) =>
      selectedAdapters(selection).pipe(
        Effect.flatMap((selected) =>
          Effect.forEach(selected, (adapter) => adapter.generate(api), { concurrency: 1 }),
        ),
        Effect.map(EffectArray.flatten),
      ),
  };
};

export class AdapterRegistry extends Effect.Service<AdapterRegistry>()(
  "api-explorer/application/AdapterRegistry",
  { sync: () => makeAdapterRegistry(builtInAdapters) },
) {}
