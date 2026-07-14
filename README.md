# API Explorer

API Explorer generates a composable Effect/Bun API proxy and a TanStack Query React dashboard from a strict, versioned JSON contract.

The contract describes authentication, resources, CRUD/search operations, pagination, relationships, validation constraints, and semantic UI types such as Markdown, HTML, CSV, enums, dates, and references. API Explorer validates the document with Effect Schema, compiles it into a stable internal representation, and passes that representation to generator adapters.

## Quick start

Requirements: [Bun](https://bun.sh/) 1.3.13 or use [aqua](https://aquaproj.github.io/) with the checked-in `aqua.yaml`.

```sh
bun install --frozen-lockfile
bun run check
bun run generate:example
```

Run the generated example:

```sh
cd .generated/jsonplaceholder/server && bun install && bun run start
cd .generated/jsonplaceholder/web && bun install && bun run dev
```

Generate only one composable target:

```sh
bun run src/cli.ts generate ./contract.json --target server --output ./generated
bun run src/cli.ts generate ./contract.json --target web --output ./generated
```

The server target exposes its schemas, TypeScript types, operation metadata, and server entrypoint separately. The web target exposes resource types, metadata, API client, form, table, page, and full application separately.

## Project status

This `0.1.0` scaffold is a working first vertical slice. It supports strict `1.0` contracts, semantic fields, relationships, CRUD/search operation metadata, four pagination strategies, environment-based API-key/bearer authentication, deterministic generation, an Effect/Bun proxy, and a React/TanStack Query dashboard. Contract migrations, richer ShadCN primitives, generated route-specific handlers, and adapter packages are planned next.

Read [the architecture](./doc/architecture.md), [the contract reference](./doc/contract-v1.md), [adapter guide](./doc/adapters.md), and [testing policy](./doc/testing.md).

## Development

```sh
bun run check:types
bun run check:biome
bun run test
```

Dependencies and tools are pinned. Tests do not rely on wall-clock time, random identifiers, test ordering, or a live API.

## License

MIT
