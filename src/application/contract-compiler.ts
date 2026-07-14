import { Effect } from "effect";
import type { ApiContractV1 } from "../contract/schema.ts";
import { compileContract } from "../ir/compile.ts";
import { RegularExpression } from "../libraries/regular-expression.ts";

export class ContractCompiler extends Effect.Service<ContractCompiler>()(
  "api-explorer/application/ContractCompiler",
  {
    effect: Effect.gen(function* () {
      const regularExpression = yield* RegularExpression;
      return {
        compile: (contract: ApiContractV1) =>
          compileContract(contract).pipe(
            Effect.provideService(RegularExpression, regularExpression),
          ),
      } as const;
    }),
    dependencies: [RegularExpression.Default],
  },
) {}
