import { it } from "@effect/vitest";
import { Effect } from "effect";
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
    expect(api.resources[0]?.name).toBe("items");
  }).pipe(Effect.provide(ContractCompiler.Default)),
);
