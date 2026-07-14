# Built-in adapters

This directory contains stack-aware code. The CLI, compiler, registry, and generator SDK must remain stack-blind.

```text
backend/effect-bun/          Effect HTTP and Bun backend flavor
frontend/tanstack-shadcn/    TanStack Query with source-owned shadcn/ui primitives
shared/                      Explicit helpers shared by compatible built-ins
index.ts                     The only built-in registration list
```

An adapter is contributor-authored metadata, exhaustive capabilities, public rendering units, and an ordered non-empty tuple of named primitives. Each primitive emits a small cohesive set of files. The SDK validates every emitted file and composes the primitive outputs; the CLI never parses or understands generated source code.

Backend and frontend adapters are selected independently:

```sh
api-explorer generate contract.json \
  --backend effect-bun \
  --frontend tanstack-shadcn
```

Use `api-explorer adapters` to inspect registered flavors.

## Minimal backend flavor

```ts
import { Effect } from "effect";
import {
  completeBackendCapabilities,
  defineAdapter,
  definePrimitive,
} from "../../generator/index.ts";

const models = definePrimitive(
  { id: "models", description: "Render validated models" },
  (api) =>
    Effect.succeed([
      {
        path: "server/models.py",
        contents: renderPydanticModels(api),
      },
    ]),
);

export const fastApiPydantic = defineAdapter({
  metadata: {
    id: "fastapi-pydantic",
    kind: "backend",
    displayName: "FastAPI/Pydantic",
    description: "FastAPI backend with strict Pydantic models",
  },
  capabilities: completeBackendCapabilities,
  units: { renderPydanticModels },
  primitives: [models],
});
```

`renderPydanticModels` belongs to the adapter. Core code must not know Python, Pydantic, React, Go, Effect HTTP, or Bun syntax.

## Contribution rules

- Give every flavor a stable lowercase kebab-case ID. Different opinions within one stack are separate flavors, such as `fastapi-pydantic` and `fastapi-sqlmodel`.
- Export small pure rendering units so they can be tested without writing files.
- Keep each primitive cohesive: project configuration, models, operations, transport, client, components, or application shell.
- Declare only supported contract and protocol versions. Backend capabilities do not claim UI editor support; frontend capabilities do.
- Implement every declared field or editor kind exhaustively. Do not add generic fallbacks.
- Provide any adapter-specific Effect services inside the primitive so the registry can compose adapters without knowing their dependencies.
- Emit only relative paths. Absolute paths, parent traversal, invalid files, duplicate primitive IDs, and duplicate output paths are rejected.
- Register the completed adapter in `src/adapters/index.ts` and add co-located unit tests plus a generated compilation integration test.

See [the adapter guide](../../doc/adapters.md) and [explorer protocol](../../doc/explorer-protocol.md) for the full contract.
