import type { Effect } from "effect";
import type { GenerationError } from "../domain/errors.ts";
import type { ApiIr } from "../ir/model.ts";

export interface GeneratedFile {
  readonly path: string;
  readonly contents: string;
}

export interface GeneratorAdapter {
  readonly name: string;
  readonly generate: (api: ApiIr) => Effect.Effect<ReadonlyArray<GeneratedFile>, GenerationError>;
}
