import { Command, FileSystem, Path } from "@effect/platform";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Duration, Effect, Schema } from "effect";
import { GenerateProject } from "../application/generate-project.ts";
import { Json } from "../libraries/json.ts";

class VerificationCommandError extends Schema.TaggedError<VerificationCommandError>()(
  "VerificationCommandError",
  { executable: Schema.String, exitCode: Schema.Number },
) {}

const run = (workingDirectory: string, executable: string, ...arguments_: ReadonlyArray<string>) =>
  Command.make(executable, ...arguments_).pipe(
    Command.workingDirectory(workingDirectory),
    Command.exitCode,
    Effect.flatMap((exitCode) =>
      exitCode === 0
        ? Effect.void
        : new VerificationCommandError({ executable, exitCode: Number(exitCode) }),
    ),
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
    contractPath: path.join(root, "examples", "showcase", "api-explorer.json"),
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
