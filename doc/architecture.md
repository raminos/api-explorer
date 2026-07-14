# Architecture

API Explorer follows a compiler pipeline:

```text
versioned JSON -> Effect Schema decode -> semantic validation -> normalized IR -> adapters -> files
```

## Boundaries

`src/contract` owns the public JSON format and structural decoding. Decoding rejects unknown properties and reports all parse errors. Each future contract version gets its own schema and migration into the current IR.

`src/ir` owns cross-resource semantic checks and normalization. The IR itself is defined with Effect Schema, not handwritten interfaces. Compilation verifies unique resources and fields, ID fields, regular expressions, references, and relationship endpoints, then decodes the produced IR again. Adapters consume only this validated representation.

`src/application` contains small composable use-case services: contract compilation, adapter selection, and project generation. The CLI only parses arguments, invokes the use case, and logs through Effect.

`src/generator` owns the adapter interfaces, built-in targets, and deterministic file writing. Every adapter declares complete contract-version, field-kind, and editor-kind capabilities. Its atomic units render data models, transfer types, endpoint manifests, transports, forms, tables, pages, and application shells. Generated files are schema-validated before filesystem effects happen.

`src/libraries` is the only boundary for non-Effect libraries that can throw. Wrappers preserve native parameter types with `Parameters` or `ConstructorParameters`, return typed Effects, and have co-located tests.

`src/cli.ts` composes those services with Effect and the Bun platform implementation.

## Generated layers

The Effect/Bun target separates resource schemas, public types, operation metadata, and the runnable proxy. The React target separates resource types, normalized metadata, the low-level client, reusable form/table components, a resource page, and the full dashboard shell.

This layout supports three adoption levels: take individual types/components, integrate the generated handlers and pages into an existing application, or run the complete generated server and dashboard.

## Safety model

The input boundary is `unknown`. Effect Schema performs structural validation with excess-property rejection. The IR compiler performs checks that require knowledge of multiple resources. Generated server mutation bodies are decoded again before reaching the upstream API. TypeScript uses strict mode, exact optional properties, unchecked indexed-access protection, and no implicit fallthrough or returns.

Generated servers use Effect HTTP routing/client services, `Config`, redacted secrets, structured logging, and Bun layers. Generated browser clients use Effect's fetch HTTP client and cross into Promise only where TanStack Query requires it.

Secrets are never stored in a contract. Authentication configuration names an environment variable, and generated servers read and inject it at runtime without logging its value.
