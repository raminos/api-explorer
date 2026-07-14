# Adapter authoring guide

API Explorer has a stack-neutral compiler and generator SDK. Contributors—not CLI users—author adapters for concrete stack flavors. Users select a registered backend and frontend independently.

## Composition model

```text
validated IR
  -> selected backend adapter -> ordered backend primitives -> backend files
  -> selected frontend adapter -> ordered frontend primitives -> frontend files
```

The CLI chooses adapter IDs and invokes `generate`. It does not inspect templates, inject language fragments, parse generated code, or know how React components, FastAPI routes, Go handlers, Effect endpoints, or Bun servers are written.

`defineAdapter` requires:

- schema-validated metadata with stable ID, kind, name, and description;
- exhaustive contract, explorer-protocol, and field capabilities;
- exhaustive editor capabilities for frontend adapters only;
- public stack-specific rendering units;
- an ordered, non-empty tuple of named primitives.

`definePrimitive` wraps a file-producing Effect. The SDK validates paths and contents after every primitive. Composition is deterministic and rejects duplicate primitive IDs and duplicate output paths.

## Primitive granularity

A primitive should own one independently understandable generated layer. Recommended backend primitives are project configuration, models/schemas, operation manifests, handlers, routing, transport, and server entrypoint. Recommended frontend primitives are project configuration, runtime contracts, API client, semantic fields, resource components, pages, and application shell.

Primitives may emit multiple files when those files form one atomic layer. They should not communicate through mutable state or read files emitted by earlier primitives. They all receive the same schema-validated `ApiIr`, so generation order affects output ordering but not behavior.

Adapters expose their smaller pure units in addition to complete primitives. This lets another flavor reuse a deliberate helper or replace one layer without copying a monolithic generator.

## Flavors and registration

An adapter ID identifies an opinionated flavor, not merely a language:

- `effect-bun`
- `fastapi-pydantic`
- `fastapi-sqlmodel`
- `go-chi-sqlc`
- `tanstack-shadcn`

Add built-ins to `src/adapters/index.ts`. The registry validates unique IDs and exposes metadata through `api-explorer adapters`. Generation accepts `--backend` and `--frontend`; `--target` still permits generating only one side.

Backend and frontend implementations are mixable because both declare an [explorer JSON protocol](./explorer-protocol.md), not because the core understands either generated stack.

The built-in `tanstack-shadcn` flavor emits shadcn components as owned source files under `components/ui`, together with `components.json`, Tailwind CSS variables, and the dependencies those components actually use. It does not imitate shadcn with a monolithic stylesheet. Generated operation metadata also controls the UI: read-only providers do not receive create, edit, or delete controls.

## Failure policy

There are no generic renderers or implicit fallbacks. Adding a contract field kind, frontend editor kind, contract version, or protocol version breaks exhaustive capabilities until each adapter explicitly supports it. Unsupported adapter IDs, invalid metadata, unsafe paths, invalid files, and collisions fail generation.

Adapter-specific libraries and services stay within the adapter boundary. Provide required layers inside primitives so the registry remains unaware of template engines and target frameworks. Keep output deterministic and test units without filesystem writes.

The contributor-oriented quick start and minimal adapter example live in [`src/adapters/README.md`](../src/adapters/README.md).
