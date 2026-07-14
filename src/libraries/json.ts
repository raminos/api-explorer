import { Effect, Option } from "effect";
import { LibraryError } from "./errors.ts";

type ParseParameters = Parameters<typeof JSON.parse>;
type StringifyParameters = Parameters<typeof JSON.stringify>;

export class Json extends Effect.Service<Json>()("api-explorer/libraries/Json", {
  sync: () => ({
    parse: (...parameters: ParseParameters): Effect.Effect<unknown, LibraryError> =>
      Effect.try({
        try: () => JSON.parse(...parameters) as unknown,
        catch: (cause) => new LibraryError({ library: "JSON", operation: "parse", cause }),
      }),
    stringify: (...parameters: StringifyParameters): Effect.Effect<string, LibraryError> =>
      Effect.try({
        try: () => {
          return Option.getOrThrowWith(
            Option.fromNullable(JSON.stringify(...parameters)),
            () => new TypeError("Value is not JSON serializable"),
          );
        },
        catch: (cause) => new LibraryError({ library: "JSON", operation: "stringify", cause }),
      }),
  }),
}) {}
