import { Data } from "effect";

export class LibraryError extends Data.TaggedError("LibraryError")<{
  readonly library: string;
  readonly operation: string;
  readonly cause: unknown;
}> {}
