import { Effect, Schema } from "effect";
import type { GenerationError } from "../domain/errors.ts";
import type { GeneratedFile, GeneratorAdapter } from "../generator/adapter.ts";
import { backendAdapter } from "../generator/backend.ts";
import { frontendAdapter } from "../generator/frontend.ts";
import type { ApiIr } from "../ir/model.ts";
import type { Json } from "../libraries/json.ts";

export const GenerationTargetSchema = Schema.Literal("all", "server", "web");
export type GenerationTarget = typeof GenerationTargetSchema.Type;

const adaptersFor = (target: GenerationTarget): ReadonlyArray<GeneratorAdapter> => {
  switch (target) {
    case "all":
      return [backendAdapter, frontendAdapter];
    case "server":
      return [backendAdapter];
    case "web":
      return [frontendAdapter];
  }
};

export class AdapterRegistry extends Effect.Service<AdapterRegistry>()(
  "api-explorer/application/AdapterRegistry",
  {
    sync: () => ({
      generate: (
        target: GenerationTarget,
        api: ApiIr,
      ): Effect.Effect<ReadonlyArray<GeneratedFile>, GenerationError, Json> =>
        Effect.forEach(adaptersFor(target), (adapter) => adapter.generate(api), {
          concurrency: 1,
        }).pipe(Effect.map((groups) => groups.flat())),
    }),
  },
) {}
