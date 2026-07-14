import { Effect } from "effect";
import { LibraryError } from "./errors.ts";

type RegularExpressionParameters = ConstructorParameters<typeof RegExp>;

export class RegularExpression extends Effect.Service<RegularExpression>()(
  "api-explorer/libraries/RegularExpression",
  {
    sync: () => ({
      compile: (...parameters: RegularExpressionParameters): Effect.Effect<RegExp, LibraryError> =>
        Effect.try({
          try: () => new RegExp(...parameters),
          catch: (cause) => new LibraryError({ library: "RegExp", operation: "compile", cause }),
        }),
    }),
  },
) {}
