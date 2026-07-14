# Testing policy

Tests use Vitest through `@effect/vitest`. Unit tests live beside each module in `__tests__`; pipeline-level integration tests live in `tests/integration`. Services are tested through their Effect layers, and adapter atomic units are tested independently from file writing.

Tests must not depend on real network services, wall-clock time, random IDs, locale defaults, test order, or previous generated files. Prefer in-memory generation and exact assertions over timing-based tests. When time or randomness becomes necessary, supply Effect services with deterministic test implementations.

The root `bun run check` command runs strict TypeScript, Biome, and the complete test suite. Release validation also generates the example, type-checks the generated server, production-builds the generated web app, and smoke-tests the running server.
