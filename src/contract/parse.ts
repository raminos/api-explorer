import { FileSystem } from "@effect/platform";
import { Effect, ParseResult, Schema } from "effect";
import { ContractReadError, ContractValidationError } from "../domain/errors.ts";
import { ApiContractV1Schema } from "./schema.ts";

const decodeContract = Schema.decodeUnknown(ApiContractV1Schema, {
  errors: "all",
  onExcessProperty: "error",
});

export const parseContract = (input: unknown) =>
  decodeContract(input).pipe(
    Effect.mapError(
      (cause) =>
        new ContractValidationError({
          message: ParseResult.TreeFormatter.formatErrorSync(cause),
          cause,
        }),
    ),
  );

export const readContract = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const contents = yield* fs
      .readFileString(path)
      .pipe(Effect.mapError((cause) => new ContractReadError({ path, cause })));
    const json = yield* Effect.try({
      try: () => JSON.parse(contents) as unknown,
      catch: (cause) =>
        new ContractValidationError({ message: "Contract is not valid JSON", cause }),
    });
    return yield* parseContract(json);
  });
