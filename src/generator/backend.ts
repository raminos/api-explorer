import { Effect, Schema } from "effect";
import { GenerationError } from "../domain/errors.ts";
import type { ApiIr, FieldIr, ResourceIr } from "../ir/model.ts";
import { Json } from "../libraries/json.ts";
import {
  type BackendAdapterUnits,
  completeCapabilities,
  defineAdapter,
  type GeneratedFile,
} from "./adapter.ts";
import { pascalCase, renderInterface } from "./render.ts";

const quote = Schema.encodeSync(Schema.parseJson(Schema.String));

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
      schema = `Schema.Literal(${field.enumValues.map(({ value }) => quote(value)).join(", ")})`;
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
      schema = "Schema.DateTimeUtc";
      break;
    case "string":
    case "markdown":
    case "html":
    case "csv": {
      const filters: Array<string> = [];
      if (field.constraints.minLength !== undefined)
        filters.push(`Schema.minLength(${field.constraints.minLength})`);
      if (field.constraints.maxLength !== undefined)
        filters.push(`Schema.maxLength(${field.constraints.maxLength})`);
      if (field.constraints.pattern !== undefined)
        filters.push(
          `Schema.pattern(compileRegularExpression(${quote(field.constraints.pattern)}))`,
        );
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

const renderAuth = (api: ApiIr): string => {
  const auth = api.api.auth;
  if (auth.type === "none") return "";
  const readSecret = `const secret = Redacted.value(yield* Config.redacted(${quote(auth.environmentVariable)}));`;
  if (auth.type === "bearer") {
    return `${readSecret}\n    clientRequest = HttpClientRequest.setHeader(clientRequest, "authorization", \`Bearer \${secret}\`);`;
  }
  if (auth.location === "header") {
    return `${readSecret}\n    clientRequest = HttpClientRequest.setHeader(clientRequest, ${quote(auth.name)}, secret);`;
  }
  return `${readSecret}\n    clientRequest = HttpClientRequest.setUrlParam(clientRequest, ${quote(auth.name)}, secret);`;
};

const server = (
  api: ApiIr,
): string => `import { FetchHttpClient, HttpClient, HttpClientRequest, HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Config, Effect, Layer, Redacted, Schema } from "effect";
import * as Models from "./models.ts";
import { operations } from "./operations.ts";
import { makeUrl } from "./libraries/url.ts";

const upstream = ${quote(api.api.baseUrl)};

const json = (value: unknown, status = 200) =>
  HttpServerResponse.json(value, {
    status,
    headers: { "access-control-allow-origin": "*" },
  });

const handler =
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const client = yield* HttpClient.HttpClient;
    const url = yield* makeUrl(request.url, "http://localhost");
    const [, resourceName, id] = url.pathname.split("/");
    if (resourceName === undefined) return yield* json({ error: "Unknown resource" }, 404);
    const resource = operations[resourceName];
    if (resource === undefined) return yield* json({ error: "Unknown resource" }, 404);

    const operation = id === undefined || id === ""
      ? request.method === "GET" ? resource.list : request.method === "POST" ? resource.create : undefined
      : request.method === "GET" ? resource.get
        : request.method === "DELETE" ? resource.delete
        : request.method === "PATCH" || request.method === "PUT" ? resource.update : undefined;
    if (operation === undefined) return yield* json({ error: "Unsupported operation" }, 405);

    const inputPath = operation.path.replace("{id}", id ?? "");
    const target = yield* makeUrl(inputPath, upstream);
    let clientRequest = HttpClientRequest.make(operation.method)(target).pipe(
      HttpClientRequest.setUrlParams(url.searchParams),
    );

    ${renderAuth(api)}

    if (request.method !== "GET" && request.method !== "DELETE") {
      const raw = yield* request.json;
      const schemaName = resourceName.slice(0, 1).toUpperCase() + resourceName.slice(1) + "Input";
      const schema = Models[schemaName as keyof typeof Models] as Schema.Schema<unknown, unknown, never> | undefined;
      if (schema === undefined) return yield* json({ error: "Missing input schema" }, 500);
      const validated = yield* Schema.decodeUnknown(schema)(raw, {
        errors: "all",
        onExcessProperty: "error",
      });
      clientRequest = yield* HttpClientRequest.bodyJson(clientRequest, validated);
    }

    const response = yield* client.execute(clientRequest);
    const payload = yield* response.json;
    return yield* json(payload, response.status);
  }).pipe(
    Effect.tapError(Effect.logError),
    Effect.catchAll(() => json({ error: "Request failed" }, 400)),
  );

const router = HttpRouter.empty.pipe(HttpRouter.all("/*", handler));
const app = router.pipe(HttpServer.serve(), HttpServer.withLogAddress);
const ServerLive = Layer.unwrapEffect(
  Config.integer("PORT").pipe(
    Config.withDefault(3001),
    Effect.map((port) => BunHttpServer.layer({ port })),
  ),
);

BunRuntime.runMain(
  Layer.launch(Layer.provide(app, Layer.merge(ServerLive, FetchHttpClient.layer))),
);
`;

export const backendUnits = {
  renderFieldSchema: schemaFor,
  renderDataModels: renderSchemas,
  renderDataTransfer: (resource: ResourceIr) => renderInterface(resource),
  renderEndpointManifest: (api: ApiIr) =>
    Effect.gen(function* () {
      const json = yield* Json;
      return yield* json.stringify(
        Object.fromEntries(api.resources.map((resource) => [resource.name, resource.operations])),
        null,
        2,
      );
    }),
  renderTransport: server,
} satisfies BackendAdapterUnits;

export const backendAdapter = defineAdapter({
  name: "effect-bun",
  capabilities: completeCapabilities,
  units: backendUnits,
  generate: (api) =>
    Effect.gen(function* () {
      const json = yield* Json;
      const routes = yield* backendUnits.renderEndpointManifest(api);
      const packageJson = yield* json.stringify(
        {
          name: `${api.api.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-server`,
          private: true,
          type: "module",
          scripts: { dev: "bun --watch src/server.ts", start: "bun src/server.ts" },
          dependencies: {
            "@effect/platform": "0.97.0",
            "@effect/platform-bun": "0.91.0",
            effect: "3.22.0",
          },
          devDependencies: {
            "@types/bun": "1.3.14",
            "@types/ws": "8.18.1",
            typescript: "5.9.3",
          },
        },
        null,
        2,
      );
      const tsconfig = yield* json.stringify(
        {
          compilerOptions: {
            allowImportingTsExtensions: true,
            exactOptionalPropertyTypes: true,
            module: "Preserve",
            noEmit: true,
            noUncheckedIndexedAccess: true,
            skipLibCheck: true,
            strict: true,
            target: "ES2024",
            types: ["bun"],
          },
          include: ["src"],
        },
        null,
        2,
      );
      return [
        {
          path: "server/package.json",
          contents: `${packageJson}\n`,
        },
        {
          path: "server/tsconfig.json",
          contents: `${tsconfig}\n`,
        },
        {
          path: "server/src/models.ts",
          contents: `import { Schema } from "effect";\nimport { compileRegularExpression } from "./libraries/regular-expression.ts";\n\n${backendUnits.renderDataModels(api)}\n`,
        },
        {
          path: "server/src/types.ts",
          contents: `${api.resources.map(backendUnits.renderDataTransfer).join("\n\n")}\n`,
        },
        {
          path: "server/src/operations.ts",
          contents: `interface Operation { readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; readonly path: string; readonly [key: string]: unknown }\nexport const operations: Record<string, Record<string, Operation | undefined>> = ${routes};\n`,
        },
        {
          path: "server/src/libraries/url.ts",
          contents: `import { Effect, Schema } from "effect";\n\nexport class UrlError extends Schema.TaggedError<UrlError>()("UrlError", { cause: Schema.Unknown }) {}\n\nexport const makeUrl = (...parameters: ConstructorParameters<typeof URL>) =>\n  Effect.try({\n    try: () => new URL(...parameters),\n    catch: (cause) => new UrlError({ cause }),\n  });\n`,
        },
        {
          path: "server/src/libraries/regular-expression.ts",
          contents: `import { Effect, Schema } from "effect";\n\nclass RegularExpressionError extends Schema.TaggedError<RegularExpressionError>()("RegularExpressionError", { cause: Schema.Unknown }) {}\n\nexport const compileRegularExpression = (...parameters: ConstructorParameters<typeof RegExp>): RegExp =>\n  Effect.runSync(Effect.try({\n    try: () => new RegExp(...parameters),\n    catch: (cause) => new RegularExpressionError({ cause }),\n  }));\n`,
        },
        { path: "server/src/server.ts", contents: backendUnits.renderTransport(api) },
      ] satisfies ReadonlyArray<GeneratedFile>;
    }).pipe(
      Effect.mapError(
        (cause) => new GenerationError({ message: "Backend adapter could not encode JSON", cause }),
      ),
    ),
});
