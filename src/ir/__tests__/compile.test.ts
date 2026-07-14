import { it } from "@effect/vitest";
import { Effect, Either } from "effect";
import { expect } from "vitest";
import { parseContract } from "../../contract/parse.ts";
import { compileContract } from "../compile.ts";

const contract = {
  schemaVersion: "1.0",
  api: { name: "Notes", baseUrl: "https://example.com", auth: { type: "none" } },
  resources: [
    {
      name: "notes",
      singularLabel: "Note",
      pluralLabel: "Notes",
      idField: "id",
      fields: [
        { name: "id", label: "ID", type: "integer", required: true },
        { name: "body", label: "Body", type: "markdown", required: true, maxLength: 1000 },
      ],
      operations: {},
    },
  ],
} as const;

it.effect("normalizes semantic fields into editor metadata", () =>
  Effect.gen(function* () {
    const parsed = yield* parseContract(contract);
    const ir = yield* compileContract(parsed);
    expect(ir.resources[0]?.fields[1]?.editor).toBe("markdown");
    expect(ir.resources[0]?.fields[1]?.constraints).toEqual({ maxLength: 1000 });
  }),
);

it.effect("rejects an ID field that does not exist", () =>
  Effect.gen(function* () {
    const parsed = yield* parseContract({
      ...contract,
      resources: [{ ...contract.resources[0], idField: "missing" }],
    });
    const result = yield* Effect.either(compileContract(parsed));
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) expect(result.left.message).toContain("unknown idField missing");
  }),
);
