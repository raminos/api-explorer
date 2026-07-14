# Adapter guide

A generator adapter implements `GeneratorAdapter` from `src/generator/adapter.ts`:

```ts
interface GeneratorAdapter {
  readonly name: string;
  readonly generate: (
    api: ApiIr,
  ) => Effect.Effect<ReadonlyArray<GeneratedFile>, GenerationError>;
}
```

Keep generation pure: return relative paths and contents, and let `writeGeneratedFiles` perform filesystem effects. Stable output makes adapters straightforward to unit test and allows a future dry-run/diff workflow.

An adapter should expose small integration points before complete entrypoints. For a backend, prefer schemas, types, handlers, routes, and then the server. For a frontend, prefer types, client functions, resource primitives, pages, and then the application shell.

Adapters must not read secrets. They may generate runtime lookups using the contract's environment-variable name. They should render resources in input order and sort any derived unordered values before emitting output.
