import { it } from "@effect/vitest";
import { Effect, Either, Option, Schema } from "effect";
import { expect } from "vitest";
import showcaseContract from "../../../examples/showcase/api-explorer.json";
import { parseContract } from "../../contract/parse.ts";
import { compileContract } from "../../ir/compile.ts";
import { Json } from "../../libraries/json.ts";
import { RegularExpression } from "../../libraries/regular-expression.ts";
import {
  completeBackendCapabilities,
  defineAdapter,
  definePrimitive,
  GeneratedFileSchema,
} from "../adapter.ts";

const metadata = {
  kind: "backend",
  displayName: "Test backend",
  description: "Adapter SDK composition test",
} as const;

it.effect("composes named primitives in declaration order", () =>
  Effect.gen(function* () {
    const api = yield* parseContract(showcaseContract).pipe(Effect.flatMap(compileContract));
    const adapter = defineAdapter({
      metadata: { ...metadata, id: "test-backend" },
      capabilities: completeBackendCapabilities,
      units: {},
      primitives: [
        definePrimitive({ id: "first", description: "First file" }, () =>
          Effect.succeed([{ path: "server/first.txt", contents: "first" }]),
        ),
        definePrimitive({ id: "second", description: "Second file" }, () =>
          Effect.succeed([{ path: "server/second.txt", contents: "second" }]),
        ),
      ],
    });

    const files = yield* adapter.generate(api);
    expect(adapter.primitives.map(({ metadata: primitive }) => primitive.id)).toEqual([
      "first",
      "second",
    ]);
    expect(files.map(({ path }) => path)).toEqual(["server/first.txt", "server/second.txt"]);
  }).pipe(Effect.provide(Json.Default), Effect.provide(RegularExpression.Default)),
);

it("rejects absolute and parent-traversing generated paths", () => {
  const decode = Schema.decodeUnknownOption(GeneratedFileSchema);
  expect(decode({ path: "/tmp/file.ts", contents: "" })).toEqual(Option.none());
  expect(decode({ path: "server/../secret", contents: "" })).toEqual(Option.none());
});

it.effect("rejects duplicate output paths across primitives", () =>
  Effect.gen(function* () {
    const api = yield* parseContract(showcaseContract).pipe(Effect.flatMap(compileContract));
    const file = { path: "server/collision.txt", contents: "value" } as const;
    const adapter = defineAdapter({
      metadata: { ...metadata, id: "collision-backend" },
      capabilities: completeBackendCapabilities,
      units: {},
      primitives: [
        definePrimitive({ id: "one", description: "First collision" }, () =>
          Effect.succeed([file]),
        ),
        definePrimitive({ id: "two", description: "Second collision" }, () =>
          Effect.succeed([file]),
        ),
      ],
    });

    const result = yield* Effect.either(adapter.generate(api));
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) expect(result.left.message).toContain("duplicate path");
  }).pipe(Effect.provide(Json.Default), Effect.provide(RegularExpression.Default)),
);
