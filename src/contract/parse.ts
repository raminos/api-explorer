import { FileSystem } from "@effect/platform";
import { Effect, Option, ParseResult, Schema } from "effect";
import { ContractReadError, ContractValidationError } from "../domain/errors.ts";
import { ApiContractV1Schema } from "./schema.ts";

const decodeContract = Schema.decodeUnknown(ApiContractV1Schema, {
  errors: "all",
  onExcessProperty: "error",
});

const decodeContractJson = Schema.decodeUnknown(Schema.parseJson(ApiContractV1Schema), {
  errors: "all",
  onExcessProperty: "error",
});

const mapParseError = (cause: ParseResult.ParseError) =>
  new ContractValidationError({
    message: ParseResult.TreeFormatter.formatErrorSync(cause),
    cause: Option.some(cause),
  });

export const parseContract = (input: unknown) =>
  decodeContract(input).pipe(Effect.mapError(mapParseError));

export const parseContractJson = (input: string) =>
  decodeContractJson(input).pipe(Effect.mapError(mapParseError));

export const readContract = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const contents = yield* fs
      .readFileString(path)
      .pipe(Effect.mapError((cause) => new ContractReadError({ path, cause })));
    return yield* parseContractJson(contents);
  });
