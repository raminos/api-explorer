import { it } from "@effect/vitest";
import { Effect, Array as EffectArray, Option } from "effect";
import { expect } from "vitest";
import showcaseContract from "../../../../examples/showcase/api-explorer.json";
import { parseContract } from "../../../contract/parse.ts";
import { compileContract } from "../../../ir/compile.ts";
import { RegularExpression } from "../../../libraries/regular-expression.ts";
import { renderDataModels, renderFieldSchema } from "../effect-schema.ts";

it.effect("renders closed arrays and excludes write-only fields from response schemas", () =>
  Effect.gen(function* () {
    const ir = yield* parseContract(showcaseContract).pipe(Effect.flatMap(compileContract));
    const profile = EffectArray.get(ir.resources, 0);
    const roles = Option.flatMap(profile, ({ fields }) =>
      EffectArray.findFirst(fields, ({ name }) => name === "roles"),
    );

    expect(Option.map(roles, renderFieldSchema)).toEqual(
      Option.some(expect.stringContaining('Schema.Literal("author", "reviewer")')),
    );
    const models = renderDataModels(ir);
    expect(models.match(/\n {2}password:/g)).toHaveLength(1);
    expect(models).toContain("Expected unique array items");
  }).pipe(Effect.provide(RegularExpression.Default)),
);
