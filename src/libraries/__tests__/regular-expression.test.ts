import { it } from "@effect/vitest";
import { Effect, Either } from "effect";
import { expect } from "vitest";
import { RegularExpression } from "../regular-expression.ts";

it.effect("wraps invalid regular expressions in a typed library error", () =>
  Effect.gen(function* () {
    const regularExpression = yield* RegularExpression;
    const result = yield* Effect.either(regularExpression.compile("["));
    expect(Either.isLeft(result)).toBe(true);
  }).pipe(Effect.provide(RegularExpression.Default)),
);
