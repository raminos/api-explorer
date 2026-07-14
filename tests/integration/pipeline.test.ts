import { it } from "@effect/vitest";
import { Effect, Array as EffectArray, Option } from "effect";
import { expect } from "vitest";
import exampleContract from "../../examples/open-brewery-db/api-explorer.json";
import showcaseContract from "../../examples/showcase/api-explorer.json";
import { backendAdapter } from "../../src/adapters/backend/effect-bun/adapter.ts";
import { frontendAdapter } from "../../src/adapters/frontend/tanstack-shadcn/adapter.ts";
import { parseContract } from "../../src/contract/parse.ts";
import { compileContract } from "../../src/ir/compile.ts";
import { Json } from "../../src/libraries/json.ts";
import { RegularExpression } from "../../src/libraries/regular-expression.ts";

it.effect("compiles the example contract through every built-in adapter", () =>
  Effect.gen(function* () {
    const ir = yield* parseContract(exampleContract).pipe(Effect.flatMap(compileContract));
    const backend = yield* backendAdapter.generate(ir);
    const frontend = yield* frontendAdapter.generate(ir);

    expect(ir.resources.map(({ name }) => name)).toEqual(["breweries"]);
    expect(backend).toHaveLength(8);
    expect(frontend).toHaveLength(26);
    expect(new Set([...backend, ...frontend].map(({ path }) => path)).size).toBe(34);
    expect(frontend.map(({ path }) => path)).toContain("web/components.json");
    expect(frontend.map(({ path }) => path)).toContain("web/src/components/ui/button.tsx");
  }).pipe(Effect.provide(Json.Default), Effect.provide(RegularExpression.Default)),
);

it.effect("preserves strict field, header, and pagination intent through every adapter", () =>
  Effect.gen(function* () {
    const ir = yield* parseContract(showcaseContract).pipe(Effect.flatMap(compileContract));
    expect(ir.api.headers).toHaveLength(2);
    expect(
      ir.resources.map(({ operations }) =>
        Option.map(operations.list, ({ pagination }) => pagination.type),
      ),
    ).toEqual([
      Option.some("none"),
      Option.some("cursor"),
      Option.some("offset"),
      Option.some("page"),
    ]);

    const profile = EffectArray.get(ir.resources, 0);
    const roles = Option.flatMap(profile, ({ fields }) =>
      EffectArray.findFirst(fields, ({ name }) => name === "roles"),
    );
    const password = Option.flatMap(profile, ({ fields }) =>
      EffectArray.findFirst(fields, ({ name }) => name === "password"),
    );
    expect(Option.map(roles, ({ editor }) => editor)).toEqual(Option.some("multiSelect"));
    expect(Option.map(password, ({ writeOnly }) => writeOnly)).toEqual(Option.some(true));

    const backend = yield* backendAdapter.generate(ir);
    const frontend = yield* frontendAdapter.generate(ir);
    const server = EffectArray.findFirst(backend, ({ path }) => path === "server/src/server.ts");
    const browserApi = EffectArray.findFirst(frontend, ({ path }) => path === "web/src/api.ts");
    const page = EffectArray.findFirst(frontend, ({ path }) => path.endsWith("ResourcePage.tsx"));
    expect(Option.map(server, ({ contents }) => contents)).toEqual(
      Option.some(expect.stringContaining('Config.redacted("SHOWCASE_TENANT_TOKEN")')),
    );
    expect(Option.map(browserApi, ({ contents }) => contents)).toEqual(
      Option.some(expect.stringContaining("does not match the declared contract")),
    );
    expect(Option.map(page, ({ contents }) => contents)).toEqual(
      Option.some(expect.stringContaining("Load more")),
    );
  }).pipe(Effect.provide(Json.Default), Effect.provide(RegularExpression.Default)),
);
