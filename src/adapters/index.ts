import type { GeneratorAdapter } from "../generator/adapter.ts";
import { backendAdapter } from "./backend/effect-bun/adapter.ts";
import { frontendAdapter } from "./frontend/tanstack-shadcn/adapter.ts";

export const builtInAdapters = [
  backendAdapter,
  frontendAdapter,
] satisfies ReadonlyArray<GeneratorAdapter>;
