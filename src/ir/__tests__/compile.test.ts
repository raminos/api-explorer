import { it } from "@effect/vitest";
import { Effect, Array as EffectArray, Either, Option } from "effect";
import { expect } from "vitest";
import { parseContract } from "../../contract/parse.ts";
import { RegularExpression } from "../../libraries/regular-expression.ts";
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
    const resource = EffectArray.get(ir.resources, 0);
    const body = Option.flatMap(resource, (value) => EffectArray.get(value.fields, 1));
    expect(Option.map(body, ({ editor }) => editor)).toEqual(Option.some("markdown"));
    const maximumLength = Option.flatMap(body, (field) => field.constraints.maxLength);
    expect(Option.contains(maximumLength, 1000)).toBe(true);
  }).pipe(Effect.provide(RegularExpression.Default)),
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
  }).pipe(Effect.provide(RegularExpression.Default)),
);

it.effect("rejects contradictory field constraints", () =>
  Effect.gen(function* () {
    const parsed = yield* parseContract({
      ...contract,
      resources: [
        {
          ...contract.resources[0],
          fields: [
            ...contract.resources[0].fields,
            {
              name: "title",
              label: "Title",
              type: "string",
              required: true,
              minLength: 20,
              maxLength: 10,
            },
          ],
        },
      ],
    });
    const result = yield* Effect.either(compileContract(parsed));
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) expect(result.left.message).toContain("minLength greater");
  }).pipe(Effect.provide(RegularExpression.Default)),
);
