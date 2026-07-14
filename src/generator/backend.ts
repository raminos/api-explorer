import { Effect, Option, Schema } from "effect";
import { GenerationError } from "../domain/errors.ts";
import type { ApiIr, ResourceIr } from "../ir/model.ts";
import { Json } from "../libraries/json.ts";
import {
  type BackendAdapterUnits,
  completeCapabilities,
  defineAdapter,
  type GeneratedFile,
} from "./adapter.ts";
import { renderInterface } from "./render.ts";
import { renderDataModels, renderFieldSchema } from "./schema-render.ts";

const quote = Schema.encodeSync(Schema.parseJson(Schema.String));

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

const renderHeaders = (api: ApiIr): string =>
  api.api.headers
    .map((header, index) => {
      if (header.source === "literal") {
        return `clientRequest = HttpClientRequest.setHeader(clientRequest, ${quote(header.name)}, ${quote(header.value)});`;
      }
      return `const headerSecret${index} = Redacted.value(yield* Config.redacted(${quote(header.environmentVariable)}));\n    clientRequest = HttpClientRequest.setHeader(clientRequest, ${quote(header.name)}, headerSecret${index});`;
    })
    .join("\n    ");

const server = (
  api: ApiIr,
): string => `import { FetchHttpClient, HttpClient, HttpClientRequest, HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Array as EffectArray, Config, Effect, Layer, Option, Redacted, Schema } from "effect";
import * as Models from "./models.ts";
import { operations } from "./operations.ts";
import { makeUrl } from "./libraries/url.ts";

const upstream = ${quote(api.api.baseUrl)};
const UnknownRecord = Schema.Record({ key: Schema.String, value: Schema.Unknown });

const atPath = (input: unknown, path: string): Option.Option<unknown> => {
  if (path === "$") return Option.some(input);
  const segments = path.replace(/^\\$\\.?/, "").split(".").filter((segment) => segment.length > 0);
  let current = Option.some(input);
  for (const segment of segments) {
    current = Option.flatMap(current, (value) =>
      Option.flatMap(Schema.decodeUnknownOption(UnknownRecord)(value), (record) => Option.fromNullable(record[segment])),
    );
  }
  return current;
};

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
    const segments = url.pathname.split("/");
    const resourceNameOption = EffectArray.get(segments, 1);
    if (Option.isNone(resourceNameOption)) return yield* json({ error: "Unknown resource" }, 404);
    const resourceName = resourceNameOption.value;
    const resourceOption = Option.fromNullable(operations[resourceName]);
    if (Option.isNone(resourceOption)) return yield* json({ error: "Unknown resource" }, 404);
    const resource = resourceOption.value;
    const id = EffectArray.get(segments, 2).pipe(Option.filter((value) => value.length > 0));
    const schemaName = resourceName.slice(0, 1).toUpperCase() + resourceName.slice(1) + "Schema";
    const schemaOption = Option.fromNullable(Models[schemaName as keyof typeof Models]).pipe(
      Option.map((schema) => schema as unknown as Schema.Schema<Readonly<Record<string, unknown>>, unknown, never>),
    );
    if (Option.isNone(schemaOption)) return yield* json({ error: "Missing resource schema" }, 500);

    const operationOption = Option.isNone(id)
      ? request.method === "GET" ? resource.list : request.method === "POST" ? resource.create : { _id: "Option", _tag: "None" } as const
      : request.method === "GET" ? resource.get
        : request.method === "DELETE" ? resource.delete
        : request.method === "PATCH" || request.method === "PUT" ? resource.update : { _id: "Option", _tag: "None" } as const;
    if (operationOption._tag === "None") return yield* json({ error: "Unsupported operation" }, 405);
    const operation = operationOption.value;

    const inputPath = operation.path.replace("{id}", Option.getOrElse(id, () => ""));
    const target = yield* makeUrl(inputPath, upstream);
    let clientRequest = HttpClientRequest.make(operation.method)(target).pipe(
      HttpClientRequest.setUrlParams(url.searchParams),
    );

    ${renderAuth(api)}
    ${renderHeaders(api)}

    if (request.method !== "GET" && request.method !== "DELETE") {
      const raw = yield* request.json;
      const inputSchemaName = resourceName.slice(0, 1).toUpperCase() + resourceName.slice(1) + "Input";
      const inputSchemaOption = Option.fromNullable(Models[inputSchemaName as keyof typeof Models]).pipe(
        Option.map((schema) => schema as Schema.Schema<unknown, unknown, never>),
      );
      if (Option.isNone(inputSchemaOption)) return yield* json({ error: "Missing input schema" }, 500);
      const validated = yield* Schema.decodeUnknown(inputSchemaOption.value)(raw, {
        errors: "all",
        onExcessProperty: "error",
      });
      const encoded = yield* Schema.encodeUnknown(inputSchemaOption.value)(validated);
      clientRequest = yield* HttpClientRequest.bodyJson(clientRequest, encoded);
    }

    const response = yield* client.execute(clientRequest);
    const payload = yield* response.json;
    if (request.method === "GET" && Option.isNone(id)) {
      if (resource.list._tag === "None") return yield* json({ error: "Missing list operation" }, 500);
      const items = atPath(payload, resource.list.value.pagination.response.itemsPath);
      if (Option.isNone(items)) return yield* json({ error: "Collection items path is missing" }, 502);
      yield* Schema.decodeUnknown(Schema.Array(schemaOption.value))(items.value, { errors: "all", onExcessProperty: "error" });
    } else if (request.method !== "DELETE") {
      yield* Schema.decodeUnknown(schemaOption.value)(payload, { errors: "all", onExcessProperty: "error" });
    }
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
  renderFieldSchema,
  renderDataModels,
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
          contents: `import { Array as EffectArray, Schema } from "effect";\nimport { compileRegularExpression } from "./libraries/regular-expression.ts";\n\n${backendUnits.renderDataModels(api)}\n`,
        },
        {
          path: "server/src/types.ts",
          contents: `import type { Option } from "effect";\n\n${api.resources.map(backendUnits.renderDataTransfer).join("\n\n")}\n`,
        },
        {
          path: "server/src/operations.ts",
          contents: `interface Operation { readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; readonly path: string }
type ResponseItems = { readonly itemsPath: string };
type Pagination =
  | { readonly type: "none"; readonly response: ResponseItems }
  | { readonly type: "offset"; readonly offsetParameter: string; readonly limitParameter: string; readonly defaultLimit: number; readonly response: ResponseItems & { readonly end: { readonly type: "shortPage" } | { readonly type: "totalItems"; readonly totalItemsPath: string } } }
  | { readonly type: "cursor"; readonly cursorParameter: string; readonly limitParameter: string; readonly nextCursorPath: string; readonly defaultLimit: number; readonly response: ResponseItems }
  | { readonly type: "page"; readonly pageParameter: string; readonly sizeParameter: string; readonly defaultSize: number; readonly firstPage: number; readonly response: ResponseItems & { readonly totalPagesPath: string } };
interface ListOperation extends Operation { readonly method: "GET"; readonly pagination: Pagination }
interface SearchOperation extends ListOperation { readonly queryParameter: string }
type Maybe<Value> = { readonly _id: "Option"; readonly _tag: "None" } | { readonly _id: "Option"; readonly _tag: "Some"; readonly value: Value }
interface ResourceOperations { readonly list: Maybe<ListOperation>; readonly get: Maybe<Operation>; readonly create: Maybe<Operation>; readonly update: Maybe<Operation>; readonly delete: Maybe<Operation>; readonly search: Maybe<SearchOperation> }
export const operations: Record<string, ResourceOperations> = ${routes};
`,
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
        (cause) =>
          new GenerationError({
            message: "Backend adapter could not encode JSON",
            cause: Option.some(cause),
          }),
      ),
    ),
});
