import { Command, FileSystem, Path } from "@effect/platform";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Console, Duration, Effect } from "effect";
import { GenerateProject } from "../application/generate-project.ts";
import { Json } from "../libraries/json.ts";

const run = (workingDirectory: string, executable: string, ...arguments_: ReadonlyArray<string>) =>
  Command.make(executable, ...arguments_).pipe(
    Command.workingDirectory(workingDirectory),
    Command.string,
    Effect.flatMap((output) => (output.length === 0 ? Effect.void : Console.log(output.trim()))),
  );

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const generateProject = yield* GenerateProject;
  const root = path.resolve(".");
  const output = path.join(root, ".generated", "verification");
  const server = path.join(output, "server");
  const web = path.join(output, "web");

  yield* fileSystem.remove(output, { recursive: true, force: true });
  const count = yield* generateProject.execute({
    contractPath: path.join(root, "examples", "jsonplaceholder", "api-explorer.json"),
    output,
    target: "all",
  });
  yield* Effect.logInfo("Generated verification project", { count });

  yield* run(server, "bun", "install");
  yield* run(server, "bunx", "tsc", "--noEmit");
  yield* run(web, "bun", "install");
  yield* run(web, "bun", "run", "build");
}).pipe(Effect.timeout(Duration.minutes(2)));

BunRuntime.runMain(
  program.pipe(
    Effect.provide(Json.Default),
    Effect.provide(GenerateProject.Default),
    Effect.provide(BunContext.layer),
  ),
);
