import { it } from "@effect/vitest";
import { Effect } from "effect";
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

    const server = yield* registry.generate("server", api);
    const web = yield* registry.generate("web", api);
    const all = yield* registry.generate("all", api);

    expect(server.every(({ path }) => path.startsWith("server/"))).toBe(true);
    expect(web.every(({ path }) => path.startsWith("web/"))).toBe(true);
    expect(all).toHaveLength(server.length + web.length);
  }).pipe(
    Effect.provide(AdapterRegistry.Default),
    Effect.provide(ContractCompiler.Default),
    Effect.provide(Json.Default),
  ),
);
