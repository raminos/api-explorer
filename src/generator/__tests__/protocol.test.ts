import { it } from "@effect/vitest";
import { Effect, Either, Schema } from "effect";
import { expect } from "vitest";
import { ExplorerProtocolSchema, explorerProtocolV1 } from "../protocol.ts";

it.effect("schema-validates the adapter-neutral JSON protocol", () =>
  Effect.gen(function* () {
    const valid = yield* Schema.decodeUnknown(ExplorerProtocolSchema)(explorerProtocolV1, {
      errors: "all",
      onExcessProperty: "error",
    });
    expect(valid.version).toBe("1.0");

    const invalid = yield* Effect.either(
      Schema.decodeUnknown(ExplorerProtocolSchema)({
        ...explorerProtocolV1,
        mediaType: "text/html",
      }),
    );
    expect(Either.isLeft(invalid)).toBe(true);
  }),
);
