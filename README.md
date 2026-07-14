# API Explorer

[![CI](https://github.com/raminos/api-explorer/actions/workflows/ci.yml/badge.svg)](https://github.com/raminos/api-explorer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Generate a composable Effect/Bun API server and TanStack Query explorer from one strict, versioned JSON contract.

API Explorer models resources, CRUD and search operations, authentication, pagination, relationships, validation constraints, and semantic UI types such as Markdown, HTML, CSV, enums, dates, and references. The contract is decoded with Effect Schema, compiled into a schema-validated IR, and rendered by exhaustive backend and frontend adapters.

Start with the runnable [Open Brewery DB contract](./examples/open-brewery-db/api-explorer.json), backed by the live community-maintained provider rather than a mock API. The [showcase contract](./examples/showcase/api-explorer.json) demonstrates every supported field, header source, nullable value, array, and pagination strategy.

## Start in under a minute

You need [Bun 1.3.13](https://bun.sh/) or [aqua](https://aquaproj.github.io/) with the checked-in [`aqua.yaml`](./aqua.yaml).

```sh
git clone https://github.com/raminos/api-explorer.git
cd api-explorer
bun install
bun run check:commit
```

`bun install` also installs the repository's pre-commit hook.

Generate and run the example:

```sh
bun run generate:example

cd .generated/open-brewery-db/server
bun install
bun run start
```

Generate the complete semantic showcase with `bun run generate:showcase`.

In another terminal:

```sh
cd .generated/open-brewery-db/web
bun install
bun run dev
```

## CLI

```sh
api-explorer adapters
api-explorer generate <contract> [--target all|server|web] \
  [--backend effect-bun] [--frontend tanstack-shadcn] \
  [--output <directory>]
```

During development, invoke the source entrypoint directly:

```sh
bun run src/cli.ts generate examples/open-brewery-db/api-explorer.json \
  --target all \
  --output .generated/open-brewery-db
```

Every argument and option is parsed by Effect CLI and decoded again through the application input schema. Unknown targets, blank paths, malformed contracts, unknown JSON properties, invalid relationships, and unsupported adapter variants fail explicitly.

Backend and frontend adapters are independent, mix-and-match flavors that implement the same versioned JSON explorer protocol. Contributors own their templates and primitives; the CLI only selects adapters and composes their validated files.

## What gets generated

| Target | Independently consumable output |
| --- | --- |
| Effect/Bun server | schemas, transfer types, operation manifest, library boundaries, transport, server entrypoint |
| TanStack/shadcn web app | `components.json`, source-owned shadcn primitives, Tailwind theme tokens, runtime schemas, transfer types, Effect HTTP client, semantic forms, tables, pagination, resource page, application shell |

Use a complete generated application or take only the types, schemas, client, form, table, or page needed by an existing project.

## Architecture

```text
JSON contract
  -> Effect Schema decoding
  -> semantic validation
  -> schema-validated IR
  -> exhaustive adapter units
  -> schema-validated generated files
  -> Effect platform filesystem
```

Domain absence is represented with `Option`, not optional properties. Lists known to be non-empty use non-empty schemas or tuple types. Adapters declare complete support records, so adding a field kind, editor kind, contract version, target, or pagination mode breaks compilation until every consumer implements it.

Key directories:

```text
src/application/   Small use-case services
src/adapters/      Contributor-authored backend and frontend flavors
src/cli/           CLI command, input schema, runtime composition
src/contract/      Public versioned contract schemas
src/generator/     Stack-neutral adapter SDK, protocol, and file writer
src/ir/            Normalized schema-backed representation
src/libraries/     Typed Effect wrappers for unsafe libraries
src/verification/  Deterministic generated-project verification
tests/integration/ Cross-module pipeline tests
doc/               Architecture and contributor references
```

## Quality gate

```sh
bun run check           # types + Biome + unit/integration tests
bun run check:generated # generate, compile server, build web app
bun run check:commit    # everything required before a commit
```

Lefthook runs `check:commit` before every commit. CI runs the same command. Tests do not depend on wall-clock time, random identifiers, ordering, or a live API.

## Documentation

- [Contract 1.0](./doc/contract-v1.md)
- [Architecture](./doc/architecture.md)
- [Effect guidelines](./doc/effect-guidelines.md)
- [Adapter guide](./doc/adapters.md)
- [Explorer protocol](./doc/explorer-protocol.md)
- [Testing policy](./doc/testing.md)
- [Roadmap](./doc/roadmap.md)
- [Contributing](./CONTRIBUTING.md)

## Status

Version `0.1.0` is a working vertical slice. It supports strict `1.0` contracts, semantic fields, relationships, CRUD/search metadata, four pagination strategies, environment-based API-key/bearer authentication, an Effect/Bun proxy, and a React/TanStack Query dashboard.

## License

[MIT](./LICENSE)
