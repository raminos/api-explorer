import { it } from "@effect/vitest";
import { Effect, Either } from "effect";
import { expect } from "vitest";
import { parseContract } from "../parse.ts";

const minimal = {
  schemaVersion: "1.0",
  api: { name: "Example", baseUrl: "https://example.com", auth: { type: "none" } },
  resources: [
    {
      name: "items",
      singularLabel: "Item",
      pluralLabel: "Items",
      idField: "id",
      fields: [{ name: "id", label: "ID", type: "integer", required: true, readOnly: true }],
      operations: {
        list: { method: "GET", path: "/items", pagination: { type: "none" } },
      },
    },
  ],
} as const;

it.effect("decodes a strict 1.0 contract", () =>
  Effect.gen(function* () {
    const contract = yield* parseContract(minimal);
    expect(contract.api.name).toBe("Example");
    expect(contract.resources[0]?.relationships).toEqual([]);
  }),
);

it.effect("rejects unknown properties", () =>
  Effect.gen(function* () {
    const result = yield* Effect.either(parseContract({ ...minimal, typo: true }));
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) expect(result.left.message).toContain("typo");
  }),
);
