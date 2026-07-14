import { it } from "@effect/vitest";
import { Effect, Array as EffectArray, Option } from "effect";
import { expect } from "vitest";
import { parseContract } from "../../contract/parse.ts";
import { ContractCompiler } from "../contract-compiler.ts";

it.effect("compiles through an injectable use-case service", () =>
  Effect.gen(function* () {
    const compiler = yield* ContractCompiler;
    const contract = yield* parseContract({
      schemaVersion: "1.0",
      api: { name: "Items", baseUrl: "https://example.com", auth: { type: "none" } },
      resources: [
        {
          name: "items",
          singularLabel: "Item",
          pluralLabel: "Items",
          idField: "id",
          fields: [{ name: "id", label: "ID", type: "integer", required: true }],
          operations: {},
        },
      ],
    });
    const api = yield* compiler.compile(contract);
    expect(Option.map(EffectArray.get(api.resources, 0), ({ name }) => name)).toEqual(
      Option.some("items"),
    );
  }).pipe(Effect.provide(ContractCompiler.Default)),
);
