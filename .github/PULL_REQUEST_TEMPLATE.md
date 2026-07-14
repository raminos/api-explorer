## Summary

<!-- What changed? Keep this concrete. -->

## Why

<!-- What problem or architectural requirement does this address? -->

## Validation

- [ ] `bun run check:commit` passes locally
- [ ] New or changed logic has co-located unit tests
- [ ] Cross-module behavior has an integration test when applicable
- [ ] Generated server and web outputs compile/build when generation changed

## Schema and exhaustiveness

- [ ] Every new boundary value is Schema-decoded
- [ ] Absence uses `Option` or a tagged union
- [ ] New domain variants are implemented by every adapter without fallbacks
- [ ] Dictionary/string-keyed types are limited to unavoidable dynamic boundaries

## Determinism and Effect

- [ ] No native clock, timer, random ID, raw platform API, or unwrapped throwing library was added
- [ ] `DateTime`, `Duration`, Effect services, and platform layers are used where applicable
- [ ] Tests do not depend on time, randomness, ordering, or live services

## Documentation

- [ ] README and relevant `doc/` pages are updated, or no documentation change is needed

## Generated output or screenshots

<!-- Add concise evidence when UI or generated structure changes. Otherwise write “Not applicable.” -->
