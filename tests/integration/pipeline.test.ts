import { readFile } from "node:fs/promises";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { expect } from "vitest";
import { parseContract } from "../../src/contract/parse.ts";
import { backendAdapter } from "../../src/generator/backend.ts";
import { frontendAdapter } from "../../src/generator/frontend.ts";
import { compileContract } from "../../src/ir/compile.ts";

it.effect("compiles the example contract through every built-in adapter", () =>
  Effect.gen(function* () {
    const json = yield* Effect.promise(() =>
      readFile("examples/jsonplaceholder/api-explorer.json", "utf8").then(
        (contents) => JSON.parse(contents) as unknown,
      ),
    );
    const ir = yield* parseContract(json).pipe(Effect.flatMap(compileContract));
    const backend = yield* backendAdapter.generate(ir);
    const frontend = yield* frontendAdapter.generate(ir);

    expect(ir.resources.map(({ name }) => name)).toEqual(["users", "posts", "comments"]);
    expect(backend).toHaveLength(6);
    expect(frontend).toHaveLength(12);
    expect(new Set([...backend, ...frontend].map(({ path }) => path)).size).toBe(18);
  }),
);
