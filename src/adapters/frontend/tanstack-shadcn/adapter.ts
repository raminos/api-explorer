import { Effect, Option } from "effect";
import { GenerationError } from "../../../domain/errors.ts";
import {
  completeFrontendCapabilities,
  defineAdapter,
  definePrimitive,
  type GeneratedFile,
} from "../../../generator/adapter.ts";
import type { ApiIr, ResourceIr } from "../../../ir/model.ts";
import { Json } from "../../../libraries/json.ts";
import { renderDataModels } from "../../shared/effect-schema.ts";
import { pascalCase, renderInterface } from "../../shared/typescript.ts";
import {
  apiClientTemplate,
  applicationTemplate,
  formTemplate,
  pageTemplate,
  stylesTemplate,
  tableTemplate,
  uiFiles,
} from "./templates.ts";

const metadata = (api: ApiIr) =>
  api.resources.map(
    ({ name, singularLabel, pluralLabel, idField, fields, relationships, operations }) => ({
      name,
      singularLabel,
      pluralLabel,
      idField,
      fields,
      relationships,
      list: operations.list,
      get: operations.get,
      create: operations.create,
      update: operations.update,
      delete: operations.delete,
      search: operations.search,
    }),
  );

export interface TanStackShadcnUnits {
  readonly renderDataTransfer: (resource: ResourceIr) => string;
  readonly renderResourceMetadata: (
    api: ApiIr,
  ) => Effect.Effect<string, import("../../../libraries/errors.ts").LibraryError, Json>;
  readonly renderApiClient: () => string;
  readonly renderCreateUpdateForm: () => string;
  readonly renderResourceTable: () => string;
  readonly renderResourcePage: () => string;
  readonly renderApplication: (api: ApiIr) => string;
}

export const frontendUnits = {
  renderDataTransfer: (resource: ResourceIr) => renderInterface(resource),
  renderResourceMetadata: (api: ApiIr) =>
    Effect.gen(function* () {
      const json = yield* Json;
      return yield* json.stringify(metadata(api), null, 2);
    }),
  renderApiClient: () => apiClientTemplate,
  renderCreateUpdateForm: () => formTemplate,
  renderResourceTable: () => tableTemplate,
  renderResourcePage: () => pageTemplate,
  renderApplication: (api: ApiIr) =>
    applicationTemplate(
      api.api.name,
      Option.getOrElse(api.api.description, () => "A schema-validated API provider."),
    ),
} satisfies TanStackShadcnUnits;

export const projectPrimitive = definePrimitive(
  { id: "project", description: "Render the shadcn Vite package and strict TypeScript project" },
  (api) =>
    Effect.gen(function* () {
      const json = yield* Json;
      const packageJson = yield* json.stringify(
        {
          name: `${api.api.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-web`,
          private: true,
          type: "module",
          scripts: { dev: "vite", build: "tsc --noEmit && vite build" },
          dependencies: {
            "@effect/platform": "0.97.0",
            "@radix-ui/react-dialog": "1.1.19",
            "@radix-ui/react-label": "2.1.11",
            "@radix-ui/react-slot": "1.3.0",
            "@tailwindcss/vite": "4.3.2",
            "@tanstack/react-query": "5.83.0",
            "@vitejs/plugin-react": "4.6.0",
            "class-variance-authority": "0.7.1",
            clsx: "2.1.1",
            effect: "3.22.0",
            "lucide-react": "1.24.0",
            react: "19.1.0",
            "react-dom": "19.1.0",
            "tailwind-merge": "3.6.0",
            tailwindcss: "4.3.2",
            vite: "7.0.4",
          },
          devDependencies: {
            "@types/react": "19.1.8",
            "@types/react-dom": "19.1.6",
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
            baseUrl: ".",
            exactOptionalPropertyTypes: true,
            jsx: "react-jsx",
            lib: ["ES2024", "DOM", "DOM.Iterable"],
            module: "ESNext",
            moduleResolution: "Bundler",
            noEmit: true,
            noUncheckedIndexedAccess: true,
            paths: { "@/*": ["./src/*"] },
            strict: true,
            target: "ES2024",
          },
          include: ["src"],
        },
        null,
        2,
      );
      const components = yield* json.stringify(
        {
          $schema: "https://ui.shadcn.com/schema.json",
          style: "new-york",
          rsc: false,
          tsx: true,
          tailwind: { css: "src/styles.css", baseColor: "neutral", cssVariables: true },
          aliases: {
            components: "@/components",
            utils: "@/lib/utils",
            ui: "@/components/ui",
            lib: "@/lib",
            hooks: "@/hooks",
          },
          iconLibrary: "lucide",
        },
        null,
        2,
      );
      return [
        { path: "web/package.json", contents: `${packageJson}\n` },
        { path: "web/tsconfig.json", contents: `${tsconfig}\n` },
        { path: "web/components.json", contents: `${components}\n` },
        {
          path: "web/vite.config.ts",
          contents: `import tailwindcss from "@tailwindcss/vite";\nimport react from "@vitejs/plugin-react";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({\n  plugins: [react(), tailwindcss()],\n  build: { rollupOptions: { output: { manualChunks: { effect: ["effect", "@effect/platform"], react: ["react", "react-dom", "@tanstack/react-query"] } } } },\n  server: {\n    host: "127.0.0.1",\n    proxy: { "/api": { target: "http://127.0.0.1:3001", changeOrigin: true, rewrite: (path) => path.replace(/^\\/api/, "") } },\n  },\n});\n`,
        },
        {
          path: "web/index.html",
          contents:
            '<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#ffffff" /><link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><rect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%234f46e5%22/><text x=%2216%22 y=%2222%22 text-anchor=%22middle%22 font-size=%2218%22 fill=%22white%22>{}</text></svg>" /><title>API Explorer</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
        },
      ] satisfies ReadonlyArray<GeneratedFile>;
    }).pipe(
      Effect.mapError(
        (cause) =>
          new GenerationError({
            message: "TanStack/shadcn project primitive could not encode JSON",
            cause: Option.some(cause),
          }),
      ),
      Effect.provide(Json.Default),
    ),
);

export const contractsPrimitive = definePrimitive(
  {
    id: "contracts",
    description: "Render browser schemas, types, and operation-aware resource metadata",
  },
  (api) =>
    Effect.gen(function* () {
      const resourceMetadata = yield* frontendUnits.renderResourceMetadata(api);
      return [
        {
          path: "web/src/types.ts",
          contents: `import type { Option } from "effect";\n\n${api.resources.map(frontendUnits.renderDataTransfer).join("\n\n")}\n`,
        },
        {
          path: "web/src/resources.ts",
          contents: `export type Maybe<Value> = { readonly _id: "Option"; readonly _tag: "None" } | { readonly _id: "Option"; readonly _tag: "Some"; readonly value: Value };
export type FieldKind = "string" | "markdown" | "html" | "csv" | "code" | "url" | "email" | "phone" | "password" | "image" | "uuid" | "date" | "time" | "datetime" | "integer" | "number" | "boolean" | "enum" | "reference" | "array";
export type EditorKind = "text" | "textarea" | "markdown" | "richText" | "table" | "code" | "url" | "email" | "phone" | "password" | "image" | "uuid" | "date" | "time" | "datetime" | "number" | "checkbox" | "select" | "resourceSelect" | "multiSelect" | "resourceMultiSelect" | "repeatable";
export type ArrayElementKind = "string" | "integer" | "number" | "boolean" | "url" | "email" | "phone" | "uuid" | "enum" | "reference";
interface EnumValue { readonly value: string; readonly label: string }
interface ArrayElementDefinition { readonly kind: ArrayElementKind; readonly enumValues: ReadonlyArray<EnumValue>; readonly referencedResource: Maybe<string>; readonly referenceValueKind: Maybe<"string" | "integer"> }
interface FieldConstraints { readonly minLength: Maybe<number>; readonly maxLength: Maybe<number>; readonly pattern: Maybe<string>; readonly minimum: Maybe<number>; readonly maximum: Maybe<number>; readonly minItems: Maybe<number>; readonly maxItems: Maybe<number>; readonly uniqueItems: boolean }
export interface FieldDefinition { readonly name: string; readonly label: string; readonly description: Maybe<string>; readonly kind: FieldKind; readonly editor: EditorKind; readonly required: boolean; readonly readOnly: boolean; readonly writeOnly: boolean; readonly nullable: boolean; readonly constraints: FieldConstraints; readonly enumValues: ReadonlyArray<EnumValue>; readonly referencedResource: Maybe<string>; readonly referenceValueKind: Maybe<"string" | "integer">; readonly language: Maybe<string>; readonly arrayElement: Maybe<ArrayElementDefinition> }
type ResponseItems = { readonly itemsPath: string };
export type PaginationDefinition =
  | { readonly type: "none"; readonly response: ResponseItems }
  | { readonly type: "offset"; readonly offsetParameter: string; readonly limitParameter: string; readonly defaultLimit: number; readonly response: ResponseItems & { readonly end: { readonly type: "shortPage" } | { readonly type: "totalItems"; readonly totalItemsPath: string } } }
  | { readonly type: "cursor"; readonly cursorParameter: string; readonly limitParameter: string; readonly defaultLimit: number; readonly nextCursorPath: string; readonly response: ResponseItems }
  | { readonly type: "page"; readonly pageParameter: string; readonly sizeParameter: string; readonly defaultSize: number; readonly firstPage: number; readonly response: ResponseItems & { readonly end: { readonly type: "shortPage" } | { readonly type: "totalPages"; readonly totalPagesPath: string } } };
interface Operation { readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; readonly path: string }
interface ListOperation extends Operation { readonly method: "GET"; readonly pagination: PaginationDefinition }
interface SearchOperation extends ListOperation { readonly queryParameter: string }
export interface ResourceDefinition { readonly name: string; readonly singularLabel: string; readonly pluralLabel: string; readonly idField: string; readonly fields: ReadonlyArray<FieldDefinition>; readonly relationships: ReadonlyArray<{ readonly name: string; readonly kind: "belongsTo" | "hasMany"; readonly resource: string; readonly localField: string; readonly foreignField: string }>; readonly list: Maybe<ListOperation>; readonly get: Maybe<Operation>; readonly create: Maybe<Operation>; readonly update: Maybe<Operation>; readonly delete: Maybe<Operation>; readonly search: Maybe<SearchOperation> }

export const resources: readonly [ResourceDefinition, ...ReadonlyArray<ResourceDefinition>] = ${resourceMetadata};
`,
        },
        {
          path: "web/src/schemas.ts",
          contents: `import { Array as EffectArray, Schema } from "effect";
import { compileRegularExpression } from "./libraries/regular-expression.ts";

${renderDataModels(api)}

export const resourceSchemas = {
${api.resources.map(({ name }) => `  ${name}: ${pascalCase(name)}Schema,`).join("\n")}
} as const;
`,
        },
        {
          path: "web/src/libraries/regular-expression.ts",
          contents: `import { Effect, Schema } from "effect";

class RegularExpressionError extends Schema.TaggedError<RegularExpressionError>()("RegularExpressionError", { cause: Schema.Unknown }) {}

export const compileRegularExpression = (...parameters: ConstructorParameters<typeof RegExp>): RegExp =>
  Effect.runSync(Effect.try({ try: () => new RegExp(...parameters), catch: (cause) => new RegularExpressionError({ cause }) }));
`,
        },
      ];
    }).pipe(
      Effect.mapError(
        (cause) =>
          new GenerationError({
            message: "TanStack/shadcn contract primitive could not encode metadata",
            cause: Option.some(cause),
          }),
      ),
      Effect.provide(Json.Default),
    ),
);

export const clientPrimitive = definePrimitive(
  { id: "client", description: "Render the schema-validating Effect HTTP client" },
  () => Effect.succeed([{ path: "web/src/api.ts", contents: frontendUnits.renderApiClient() }]),
);

export const resourceComponentsPrimitive = definePrimitive(
  {
    id: "resource-components",
    description: "Render shadcn forms, tables, states, and resource pages",
  },
  () =>
    Effect.succeed([
      {
        path: "web/src/components/ResourceForm.tsx",
        contents: frontendUnits.renderCreateUpdateForm(),
      },
      {
        path: "web/src/components/ResourceTable.tsx",
        contents: frontendUnits.renderResourceTable(),
      },
      { path: "web/src/components/ResourcePage.tsx", contents: frontendUnits.renderResourcePage() },
      ...uiFiles,
    ]),
);

export const applicationPrimitive = definePrimitive(
  { id: "application", description: "Render the responsive shadcn dashboard shell and entrypoint" },
  (api) =>
    Effect.succeed([
      { path: "web/src/App.tsx", contents: frontendUnits.renderApplication(api) },
      { path: "web/src/styles.css", contents: stylesTemplate },
      {
        path: "web/src/main.tsx",
        contents: `import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport { QueryClient, QueryClientProvider } from "@tanstack/react-query";\nimport { App } from "./App.tsx";\nimport "./styles.css";\n\nconst client = new QueryClient();\nconst root = document.getElementById("root");\nif (root === null) throw new Error("Root element is missing");\ncreateRoot(root).render(<StrictMode><QueryClientProvider client={client}><App /></QueryClientProvider></StrictMode>);\n`,
      },
    ]),
);

export const frontendAdapter = defineAdapter({
  metadata: {
    id: "tanstack-shadcn",
    kind: "frontend",
    displayName: "TanStack/shadcn",
    description: "TanStack Query explorer composed from source-owned shadcn/ui primitives",
  },
  capabilities: completeFrontendCapabilities,
  units: frontendUnits,
  primitives: [
    projectPrimitive,
    contractsPrimitive,
    clientPrimitive,
    resourceComponentsPrimitive,
    applicationPrimitive,
  ],
});
