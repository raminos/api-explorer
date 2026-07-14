import { Command } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { GenerateProject } from "../application/generate-project.ts";
import { Json } from "../libraries/json.ts";
import { apiExplorerCommand } from "./command.ts";

const cli = Command.run(apiExplorerCommand, { name: "API Explorer", version: "0.1.0" });

BunRuntime.runMain(
  cli(process.argv).pipe(
    Effect.provide(Json.Default),
    Effect.provide(GenerateProject.Default),
    Effect.provide(BunContext.layer),
  ),
);
