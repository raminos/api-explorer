import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import { WriteError } from "../domain/errors.ts";
import type { GeneratedFile } from "./adapter.ts";

export const writeGeneratedFiles = (output: string, files: ReadonlyArray<GeneratedFile>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
      const destination = path.resolve(output, file.path);
      yield* fs
        .makeDirectory(path.dirname(destination), { recursive: true })
        .pipe(Effect.mapError((cause) => new WriteError({ path: destination, cause })));
      yield* fs
        .writeFileString(destination, file.contents)
        .pipe(Effect.mapError((cause) => new WriteError({ path: destination, cause })));
    }
    return files.length;
  });
