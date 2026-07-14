# Contributing to API Explorer

Thank you for improving API Explorer. The project deliberately favors explicit, schema-validated code over permissive fallbacks.

## Setup

```sh
git clone https://github.com/raminos/api-explorer.git
cd api-explorer
bun install
bun run check:commit
```

`bun install` installs Lefthook. The pre-commit hook runs the complete local quality gate; do not bypass it.

## Before writing code

1. Read the [architecture](./doc/architecture.md) and [Effect guidelines](./doc/effect-guidelines.md).
2. Find the smallest owning module and place unit tests in its adjacent `__tests__` directory.
3. Decide which Schema owns every new input, output, error, or domain value.
4. If adding a domain variant, update every exhaustive adapter capability and renderer.

## Engineering rules

- Decode external and cross-layer values with Effect Schema.
- Represent absence with `Option` or a tagged union, never an optional domain property.
- Use non-empty collections when emptiness is invalid.
- Use `DateTime`, `Duration`, Effect `Clock`, and Effect randomness instead of native nondeterminism.
- Use Effect platform services for files, paths, commands, terminals, HTTP, configuration, and runtime integration.
- Put throwing third-party/native calls behind a typed service in `src/libraries` and preserve their parameter types.
- Do not add generic adapter fallbacks. An unsupported variant must fail explicitly.
- Keep services and use cases small, composable, and independently testable.

## Tests

Unit tests are co-located with their module. Cross-module behavior belongs in `tests/integration`.

```sh
bun run test
bun run check:types
bun run check:biome
bun run check:generated
```

The single required pre-PR command is:

```sh
bun run check:commit
```

It verifies formatting/linting, strict types, unit tests, integration tests, generated server compilation, and the generated web production build.

## Pull requests

- Keep the change focused and explain the domain or architectural reason.
- Add or update co-located tests for every behavior change.
- Update contract, architecture, adapter, or contributor documentation when its promise changes.
- Complete every applicable item in the pull request template.
- Never include secrets, generated `.generated` output, or unrelated formatting changes.
- Do not prefix the pull request title with `[codex]`.

Maintainers may ask for a change to be split when independent concerns cannot be reviewed safely together.
