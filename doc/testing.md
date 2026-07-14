# Testing policy

Tests use Vitest through `@effect/vitest`. Unit tests live beside each module in `__tests__`; pipeline-level integration tests live in `tests/integration`.

Tests must not depend on real network services, wall-clock time, random IDs, locale defaults, test order, or previous generated files. Prefer in-memory generation and exact assertions over timing-based tests. When time or randomness becomes necessary, supply Effect services with deterministic test implementations.

The root `bun run check` command runs strict TypeScript, Biome, and the complete test suite. Generated fixtures should be compiled in integration tests as targets mature.
