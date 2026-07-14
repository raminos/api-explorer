import { it } from "@effect/vitest";
import { Effect, Either } from "effect";
import { expect } from "vitest";
import { Json } from "../json.ts";

it.effect("wraps JSON parse failures in a typed library error", () =>
  Effect.gen(function* () {
    const json = yield* Json;
    const result = yield* Effect.either(json.parse("{"));
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.library).toBe("JSON");
      expect(result.left.operation).toBe("parse");
    }
  }).pipe(Effect.provide(Json.Default)),
);

it.effect("preserves the native stringify parameter surface", () =>
  Effect.gen(function* () {
    const json = yield* Json;
    const output = yield* json.stringify({ value: 1 }, null, 2);
    expect(output).toBe('{\n  "value": 1\n}');
  }).pipe(Effect.provide(Json.Default)),
);
