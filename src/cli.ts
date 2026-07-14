#!/usr/bin/env bun
import { Args, Command, Options } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Console, Effect } from "effect";
import { GenerateProject } from "./application/generate-project.ts";
import { Json } from "./libraries/json.ts";

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
      const generateProject = yield* GenerateProject;
      const count = yield* generateProject.execute({ contractPath, output, target });
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

BunRuntime.runMain(
  cli(process.argv).pipe(
    Effect.provide(Json.Default),
    Effect.provide(GenerateProject.Default),
    Effect.provide(BunContext.layer),
  ),
);
