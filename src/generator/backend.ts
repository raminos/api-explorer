import { Effect } from "effect";
import type { ApiIr, FieldIr } from "../ir/model.ts";
import type { GeneratedFile, GeneratorAdapter } from "./adapter.ts";
import { pascalCase, renderInterface } from "./render.ts";

const schemaFor = (field: FieldIr): string => {
  let schema: string;
  switch (field.kind) {
    case "integer":
      schema = "Schema.Number.pipe(Schema.int())";
      break;
    case "number":
      schema = "Schema.Number";
      break;
    case "boolean":
      schema = "Schema.Boolean";
      break;
    case "reference":
      schema =
        field.referenceValueKind === "integer"
          ? "Schema.Number.pipe(Schema.int())"
          : "Schema.String";
      break;
    case "enum":
      schema = `Schema.Literal(${field.enumValues.map(({ value }) => JSON.stringify(value)).join(", ")})`;
      break;
    case "email":
      schema = "Schema.String.pipe(Schema.pattern(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/))";
      break;
    case "url":
      schema = "Schema.String.pipe(Schema.pattern(/^https?:\\/\\//))";
      break;
    case "date":
      schema = "Schema.String.pipe(Schema.pattern(/^\\d{4}-\\d{2}-\\d{2}$/))";
      break;
    case "time":
      schema = "Schema.String.pipe(Schema.pattern(/^\\d{2}:\\d{2}(?::\\d{2})?$/))";
      break;
    case "datetime":
      schema = "Schema.String.pipe(Schema.pattern(/^\\d{4}-\\d{2}-\\d{2}T/))";
      break;
    default: {
      const filters: Array<string> = [];
      if (field.constraints.minLength !== undefined)
        filters.push(`Schema.minLength(${field.constraints.minLength})`);
      if (field.constraints.maxLength !== undefined)
        filters.push(`Schema.maxLength(${field.constraints.maxLength})`);
      if (field.constraints.pattern !== undefined)
        filters.push(`Schema.pattern(new RegExp(${JSON.stringify(field.constraints.pattern)}))`);
      schema = "Schema.String";
      if (filters.length > 0) schema = `${schema}.pipe(${filters.join(", ")})`;
    }
  }
  if (field.kind === "integer" || field.kind === "number") {
    const filters: Array<string> = [];
    if (field.constraints.minimum !== undefined)
      filters.push(`Schema.greaterThanOrEqualTo(${field.constraints.minimum})`);
    if (field.constraints.maximum !== undefined)
      filters.push(`Schema.lessThanOrEqualTo(${field.constraints.maximum})`);
    if (filters.length > 0) schema = `${schema}.pipe(${filters.join(", ")})`;
  }
  if (field.nullable) schema = `Schema.NullOr(${schema})`;
  if (!field.required) schema = `Schema.optional(${schema})`;
  return schema;
};

const renderSchemas = (api: ApiIr): string =>
  api.resources
    .map((resource) => {
      const fields = resource.fields
        .map((field) => `  ${field.name}: ${schemaFor(field)},`)
        .join("\n");
      const writable = resource.fields
        .filter(({ readOnly }) => !readOnly)
        .map((field) => `  ${field.name}: ${schemaFor(field)},`)
        .join("\n");
      return `export const ${pascalCase(resource.name)}Schema = Schema.Struct({\n${fields}\n});\nexport const ${pascalCase(resource.name)}Input = Schema.Struct({\n${writable}\n});`;
    })
    .join("\n\n");

const renderRoutes = (api: ApiIr): string =>
  JSON.stringify(
    Object.fromEntries(api.resources.map((resource) => [resource.name, resource.operations])),
    null,
    2,
  );

const renderAuth = (api: ApiIr): string => {
  const auth = api.api.auth;
  if (auth.type === "none") return "";
  const readSecret = `const secret = Bun.env[${JSON.stringify(auth.environmentVariable)}];\n    if (secret === undefined) return json({ error: ${JSON.stringify(`Missing environment variable ${auth.environmentVariable}`)} }, 500);`;
  if (auth.type === "bearer") {
    return `${readSecret}\n    headers.set("authorization", \`Bearer \${secret}\`);`;
  }
  if (auth.location === "header") {
    return `${readSecret}\n    headers.set(${JSON.stringify(auth.name)}, secret);`;
  }
  return `${readSecret}\n    target.searchParams.set(${JSON.stringify(auth.name)}, secret);`;
};

const server = (api: ApiIr): string => `import { Effect, Schema } from "effect";
import * as Models from "./models.ts";
import { operations } from "./operations.ts";

const upstream = ${JSON.stringify(api.api.baseUrl)};

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "access-control-allow-origin": "*" } });

const program = (request: Request) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const [, resourceName, id] = url.pathname.split("/");
    if (resourceName === undefined) return json({ error: "Unknown resource" }, 404);
    const resource = operations[resourceName];
    if (resource === undefined) return json({ error: "Unknown resource" }, 404);

    const operation = id === undefined || id === ""
      ? request.method === "GET" ? resource.list : request.method === "POST" ? resource.create : undefined
      : request.method === "GET" ? resource.get
        : request.method === "DELETE" ? resource.delete
        : request.method === "PATCH" || request.method === "PUT" ? resource.update : undefined;
    if (operation === undefined) return json({ error: "Unsupported operation" }, 405);

    const inputPath = operation.path.replace("{id}", encodeURIComponent(id ?? ""));
    const target = new URL(inputPath, upstream);
    url.searchParams.forEach((value, key) => target.searchParams.set(key, value));

    const headers = new Headers();
    ${renderAuth(api)}

    let body: string | undefined;
    if (request.method !== "GET" && request.method !== "DELETE") {
      const raw = yield* Effect.tryPromise(() => request.json());
      const schemaName = resourceName.slice(0, 1).toUpperCase() + resourceName.slice(1) + "Input";
      const schema = Models[schemaName as keyof typeof Models] as Schema.Schema<unknown, unknown, never> | undefined;
      if (schema === undefined) return json({ error: "Missing input schema" }, 500);
      const validated = yield* Schema.decodeUnknown(schema)(raw, {
        errors: "all",
        onExcessProperty: "error",
      });
      body = JSON.stringify(validated);
    }

    const response = yield* Effect.tryPromise(() =>
      fetch(target, {
        method: operation.method,
        ...(body === undefined
          ? { headers }
          : { headers: new Headers([...headers, ["content-type", "application/json"]]), body }),
      }),
    );
    const payload = yield* Effect.tryPromise(() => response.json());
    return json(payload, response.status);
  }).pipe(
    Effect.catchAll((cause) => Effect.succeed(json({ error: String(cause) }, 400))),
  );

Bun.serve({
  port: Number(Bun.env.PORT ?? 3001),
  fetch: (request) => Effect.runPromise(program(request)),
});

console.log("API Explorer server listening on http://localhost:" + (Bun.env.PORT ?? "3001"));
`;

export const backendAdapter: GeneratorAdapter = {
  name: "effect-bun",
  generate: (api) =>
    Effect.succeed<ReadonlyArray<GeneratedFile>>([
      {
        path: "server/package.json",
        contents: `${JSON.stringify(
          {
            name: `${api.api.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-server`,
            private: true,
            type: "module",
            scripts: { dev: "bun --watch src/server.ts", start: "bun src/server.ts" },
            dependencies: { effect: "3.22.0" },
            devDependencies: { "@types/bun": "1.3.6", typescript: "5.9.3" },
          },
          null,
          2,
        )}\n`,
      },
      {
        path: "server/tsconfig.json",
        contents: `${JSON.stringify(
          {
            compilerOptions: {
              allowImportingTsExtensions: true,
              exactOptionalPropertyTypes: true,
              module: "Preserve",
              noEmit: true,
              noUncheckedIndexedAccess: true,
              strict: true,
              target: "ES2024",
              types: ["bun"],
            },
            include: ["src"],
          },
          null,
          2,
        )}\n`,
      },
      {
        path: "server/src/models.ts",
        contents: `import { Schema } from "effect";\n\n${renderSchemas(api)}\n`,
      },
      {
        path: "server/src/types.ts",
        contents: `${api.resources.map(renderInterface).join("\n\n")}\n`,
      },
      {
        path: "server/src/operations.ts",
        contents: `interface Operation { readonly method: string; readonly path: string; readonly [key: string]: unknown }\nexport const operations: Record<string, Record<string, Operation | undefined>> = ${renderRoutes(api)};\n`,
      },
      { path: "server/src/server.ts", contents: server(api) },
    ]),
};
