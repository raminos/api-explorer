import { it } from "@effect/vitest";
import { Effect, Either } from "effect";
import { expect } from "vitest";
import { decodeCliGenerateInput } from "../input.ts";

it.effect("schema-validates every generate command value", () =>
  Effect.gen(function* () {
    const valid = yield* decodeCliGenerateInput({
      contractPath: "contract.json",
      output: "generated",
      target: "server",
      backendAdapter: "effect-bun",
      frontendAdapter: "tanstack-shadcn",
    });
    expect(valid.target).toBe("server");

    const invalid = yield* Effect.either(
      decodeCliGenerateInput({
        contractPath: "contract.json",
        output: "generated",
        target: "unsupported",
        backendAdapter: "effect-bun",
        frontendAdapter: "tanstack-shadcn",
      }),
    );
    expect(Either.isLeft(invalid)).toBe(true);
  }),
);
