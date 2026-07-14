# Architecture

API Explorer follows a compiler pipeline:

```text
versioned JSON -> Effect Schema decode -> semantic validation -> normalized IR -> adapters -> files
```

## Boundaries

`src/contract` owns the public JSON format and structural decoding. Decoding rejects unknown properties and reports all parse errors. Each future contract version gets its own schema and migration into the current IR.

`src/ir` owns cross-resource semantic checks and normalization. It verifies unique resources and fields, ID fields, references, and relationship endpoints. It also turns semantic field types into explicit editor choices. Adapters consume only this stable representation.

`src/generator` owns the adapter interface, built-in targets, and deterministic file writing. Adapters are pure functions from IR to an ordered collection of `{ path, contents }` values. Filesystem effects happen only after generation.

`src/cli.ts` composes those layers with Effect and the Bun platform implementation.

## Generated layers

The Effect/Bun target separates resource schemas, public types, operation metadata, and the runnable proxy. The React target separates resource types, normalized metadata, the low-level client, reusable form/table components, a resource page, and the full dashboard shell.

This layout supports three adoption levels: take individual types/components, integrate the generated handlers and pages into an existing application, or run the complete generated server and dashboard.

## Safety model

The input boundary is `unknown`. Effect Schema performs structural validation with excess-property rejection. The IR compiler performs checks that require knowledge of multiple resources. Generated server mutation bodies are decoded again before reaching the upstream API. TypeScript uses strict mode, exact optional properties, unchecked indexed-access protection, and no implicit fallthrough or returns.

Secrets are never stored in a contract. Authentication configuration names an environment variable, and generated servers read and inject it at runtime without logging its value.
