import { Args, Command, Options } from "@effect/cli";
import { Console, Effect } from "effect";
import { GenerateProject } from "../application/generate-project.ts";
import { decodeCliGenerateInput } from "./input.ts";

const contractPath = Args.text({ name: "contract" });
const output = Options.text("output").pipe(
  Options.withAlias("o"),
  Options.withDefault("api-explorer-output"),
);
const target = Options.choice("target", ["all", "server", "web"] as const).pipe(
  Options.withAlias("t"),
  Options.withDefault("all" as const),
);

const generate = Command.make("generate", { contractPath, output, target }, (unvalidatedInput) =>
  Effect.gen(function* () {
    const input = yield* decodeCliGenerateInput(unvalidatedInput);
    const generateProject = yield* GenerateProject;
    const count = yield* generateProject.execute(input);
    yield* Console.log(`Generated ${count} files in ${input.output}`);
  }),
).pipe(
  Command.withDescription(
    "Validate a versioned API contract and generate the selected composable targets.",
  ),
);

export const apiExplorerCommand = Command.make("api-explorer", {}).pipe(
  Command.withDescription(
    "Generate a composable API server and explorer UI from a strict JSON contract.",
  ),
  Command.withSubcommands([generate]),
);
