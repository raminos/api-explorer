import { it } from "@effect/vitest";
import { Effect, Either } from "effect";
import { expect } from "vitest";
import exampleContract from "../../../examples/jsonplaceholder/api-explorer.json";
import { parseContract } from "../../contract/parse.ts";
import { Json } from "../../libraries/json.ts";
import { AdapterRegistry } from "../adapter-registry.ts";
import { ContractCompiler } from "../contract-compiler.ts";

it.effect("selects targets explicitly without adapter fallbacks", () =>
  Effect.gen(function* () {
    const registry = yield* AdapterRegistry;
    const compiler = yield* ContractCompiler;
    const contract = yield* parseContract(exampleContract);
    const api = yield* compiler.compile(contract);

    const adapters = {
      backendAdapter: "effect-bun",
      frontendAdapter: "tanstack-shadcn",
    } as const;
    const server = yield* registry.generate({ ...adapters, target: "server" }, api);
    const web = yield* registry.generate({ ...adapters, target: "web" }, api);
    const all = yield* registry.generate({ ...adapters, target: "all" }, api);

    expect(server.every(({ path }) => path.startsWith("server/"))).toBe(true);
    expect(web.every(({ path }) => path.startsWith("web/"))).toBe(true);
    expect(all).toHaveLength(server.length + web.length);
    expect(registry.adapters("backend").map(({ metadata }) => metadata.id)).toEqual(["effect-bun"]);
    expect(registry.adapters("frontend").map(({ metadata }) => metadata.id)).toEqual([
      "tanstack-shadcn",
    ]);

    const missing = yield* Effect.either(
      registry.generate({ ...adapters, backendAdapter: "missing-backend", target: "server" }, api),
    );
    expect(Either.isLeft(missing)).toBe(true);
    if (Either.isLeft(missing)) expect(missing.left.message).toContain("missing-backend");
  }).pipe(
    Effect.provide(AdapterRegistry.Default),
    Effect.provide(ContractCompiler.Default),
    Effect.provide(Json.Default),
  ),
);
