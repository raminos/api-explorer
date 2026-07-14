import { it } from "@effect/vitest";
import { Effect } from "effect";
import { expect } from "vitest";
import exampleContract from "../../examples/jsonplaceholder/api-explorer.json";
import { parseContract } from "../../src/contract/parse.ts";
import { backendAdapter } from "../../src/generator/backend.ts";
import { frontendAdapter } from "../../src/generator/frontend.ts";
import { compileContract } from "../../src/ir/compile.ts";
import { RegularExpression } from "../../src/libraries/regular-expression.ts";

it.effect("compiles the example contract through every built-in adapter", () =>
  Effect.gen(function* () {
    const ir = yield* parseContract(exampleContract).pipe(Effect.flatMap(compileContract));
    const backend = yield* backendAdapter.generate(ir);
    const frontend = yield* frontendAdapter.generate(ir);

    expect(ir.resources.map(({ name }) => name)).toEqual(["users", "posts", "comments"]);
    expect(backend).toHaveLength(6);
    expect(frontend).toHaveLength(12);
    expect(new Set([...backend, ...frontend].map(({ path }) => path)).size).toBe(18);
  }).pipe(Effect.provide(RegularExpression.Default)),
);
