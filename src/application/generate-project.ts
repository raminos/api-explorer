import { Effect, Schema } from "effect";
import { readContract } from "../contract/parse.ts";
import { writeGeneratedFiles } from "../generator/write.ts";
import { AdapterRegistry, GenerationTargetSchema } from "./adapter-registry.ts";
import { ContractCompiler } from "./contract-compiler.ts";

export const GenerateProjectInputSchema = Schema.Struct({
  contractPath: Schema.String.pipe(Schema.minLength(1)),
  output: Schema.String.pipe(Schema.minLength(1)),
  target: GenerationTargetSchema,
});
export type GenerateProjectInput = typeof GenerateProjectInputSchema.Type;

const decodeInput = Schema.decodeUnknown(GenerateProjectInputSchema, {
  errors: "all",
  onExcessProperty: "error",
});

export class GenerateProject extends Effect.Service<GenerateProject>()(
  "api-explorer/application/GenerateProject",
  {
    effect: Effect.gen(function* () {
      const compiler = yield* ContractCompiler;
      const adapters = yield* AdapterRegistry;
      return {
        execute: (input: GenerateProjectInput) =>
          Effect.gen(function* () {
            const validatedInput = yield* decodeInput(input);
            const contract = yield* readContract(validatedInput.contractPath);
            const api = yield* compiler.compile(contract);
            const files = yield* adapters.generate(validatedInput.target, api);
            return yield* writeGeneratedFiles(validatedInput.output, files);
          }),
      } as const;
    }),
    dependencies: [ContractCompiler.Default, AdapterRegistry.Default],
  },
) {}
