import { Data } from "effect";

export class ContractReadError extends Data.TaggedError("ContractReadError")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export class ContractValidationError extends Data.TaggedError("ContractValidationError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class GenerationError extends Data.TaggedError("GenerationError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class WriteError extends Data.TaggedError("WriteError")<{
  readonly path: string;
  readonly cause: unknown;
}> {}
