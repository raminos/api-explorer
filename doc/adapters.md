# Adapter guide

A generator adapter implements `GeneratorAdapter` from `src/generator/adapter.ts`. Its capability record is deliberately exhaustive:

```ts
interface GeneratorAdapter {
  readonly capabilities: {
    readonly contractVersions: Record<ContractVersion, true>;
    readonly fieldKinds: Record<FieldKind, true>;
    readonly editorKinds: Record<EditorKind, true>;
  };
  readonly units: BackendAdapterUnits | FrontendAdapterUnits;
  readonly name: string;
  readonly generate: (
    api: ApiIr,
  ) => Effect.Effect<ReadonlyArray<GeneratedFile>, GenerationError, Json>;
}
```

Backend units separately render field schemas, data models, transfer types, endpoint manifests, and transport/application code. Frontend units separately render transfer types, resource metadata, the API client, create/update form, table, page, and application shell. The built-in adapters compose these same public units; they are not documentation-only hooks.

Keep rendering pure except for injected library services: return relative paths and contents, and let `writeGeneratedFiles` perform filesystem effects. Stable output makes adapters straightforward to unit test and allows a future dry-run/diff workflow.

An adapter should expose small integration points before complete entrypoints. For a backend, prefer schemas, types, handlers, routes, and then the server. For a frontend, prefer types, client functions, resource primitives, pages, and then the application shell.

There are no fallback renderers. Every domain field/editor kind must have an explicit implementation, and adding a new kind causes adapter compilation to fail. Unsupported methods or resources produce explicit errors. Adapters must not read secrets; generated servers use redacted Effect configuration at runtime. Adapters render resources in input order and sort derived unordered values before emitting output.
