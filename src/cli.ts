#!/usr/bin/env bun
import { Args, Command, Options } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Console, Effect } from "effect";
import { readContract } from "./contract/parse.ts";
import { backendAdapter } from "./generator/backend.ts";
import { frontendAdapter } from "./generator/frontend.ts";
import { writeGeneratedFiles } from "./generator/write.ts";
import { compileContract } from "./ir/compile.ts";

const contractPath = Args.text({ name: "contract" });
const output = Options.text("output").pipe(
  Options.withAlias("o"),
  Options.withDefault("api-explorer-output"),
);
const target = Options.choice("target", ["all", "server", "web"] as const).pipe(
  Options.withAlias("t"),
  Options.withDefault("all" as const),
);

const generate = Command.make(
  "generate",
  { contractPath, output, target },
  ({ contractPath, output, target }) =>
    Effect.gen(function* () {
      const contract = yield* readContract(contractPath);
      const ir = yield* compileContract(contract);
      const adapters =
        target === "server"
          ? [backendAdapter]
          : target === "web"
            ? [frontendAdapter]
            : [backendAdapter, frontendAdapter];
      const groups = yield* Effect.forEach(adapters, (adapter) => adapter.generate(ir));
      const files = groups.flat();
      const count = yield* writeGeneratedFiles(output, files);
      yield* Console.log(`Generated ${count} files in ${output}`);
    }),
);

const command = Command.make("api-explorer", {}).pipe(
  Command.withDescription(
    "Generate a composable API server and explorer UI from a strict JSON contract.",
  ),
  Command.withSubcommands([generate]),
);

const cli = Command.run(command, { name: "API Explorer", version: "0.1.0" });

BunRuntime.runMain(cli(process.argv).pipe(Effect.provide(BunContext.layer)));
