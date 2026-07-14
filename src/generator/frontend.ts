import { Effect, Option } from "effect";
import { GenerationError } from "../domain/errors.ts";
import type { ApiIr, ResourceIr } from "../ir/model.ts";
import { Json } from "../libraries/json.ts";
import {
  completeCapabilities,
  defineAdapter,
  type FrontendAdapterUnits,
  type GeneratedFile,
} from "./adapter.ts";
import { renderInterface } from "./render.ts";

const metadata = (api: ApiIr) =>
  api.resources.map(({ name, singularLabel, pluralLabel, idField, fields, relationships }) => ({
    name,
    singularLabel,
    pluralLabel,
    idField,
    fields,
    relationships,
  }));

const apiClient = `import { FetchHttpClient, HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect, Option, Schema } from "effect";

const baseUrl = Option.getOrElse(
  Option.fromNullable(import.meta.env.VITE_API_URL),
  () => "http://localhost:3001",
);

class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  status: Schema.Number,
}) {}

const execute = (request: HttpClientRequest.HttpClientRequest): Promise<unknown> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.execute(request);
    if (response.status < 200 || response.status >= 300) {
      return yield* new ApiError({ status: response.status });
    }
    return yield* response.json;
  }).pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromise);

const mutationRequest = (path: string, method: "POST" | "PATCH" | "DELETE", body: Option.Option<unknown>) =>
  Effect.gen(function* () {
    switch (method) {
      case "POST":
        return yield* HttpClientRequest.post(\`\${baseUrl}/\${path}\`).pipe(
          HttpClientRequest.bodyJson(Option.getOrNull(body)),
        );
      case "PATCH":
        return yield* HttpClientRequest.patch(\`\${baseUrl}/\${path}\`).pipe(
          HttpClientRequest.bodyJson(Option.getOrNull(body)),
        );
      case "DELETE":
        return HttpClientRequest.del(\`\${baseUrl}/\${path}\`);
    }
  });

const mutate = (path: string, method: "POST" | "PATCH" | "DELETE", body: Option.Option<unknown>) =>
  mutationRequest(path, method, body).pipe(
    Effect.flatMap((request) => Effect.promise(() => execute(request))),
    Effect.runPromise,
  );

export const api = {
  list: (resource: string) => execute(HttpClientRequest.get(\`\${baseUrl}/\${resource}\`)),
  get: (resource: string, id: string) => execute(HttpClientRequest.get(\`\${baseUrl}/\${resource}/\${id}\`)),
  create: (resource: string, input: unknown) => mutate(resource, "POST", Option.some(input)),
  update: (resource: string, id: string, input: unknown) => mutate(\`\${resource}/\${id}\`, "PATCH", Option.some(input)),
  remove: (resource: string, id: string) => mutate(\`\${resource}/\${id}\`, "DELETE", Option.none()),
};
`;

const form = `import type { FormEvent } from "react";
import { Array as EffectArray, Option } from "effect";
import type { ResourceDefinition } from "../resources.ts";

export function ResourceForm({ resource, initial, onCancel, onSubmit }: {
  readonly resource: ResourceDefinition;
  readonly initial: Option.Option<Record<string, unknown>>;
  readonly onCancel: Option.Option<() => void>;
  readonly onSubmit: (input: Record<string, unknown>) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const entries = EffectArray.filterMap(resource.fields.filter((field) => !field.readOnly), (field): Option.Option<readonly [string, unknown]> => {
      const raw = data.get(field.name);
      if (field.kind === "boolean") return Option.some([field.name, data.has(field.name)] as const);
      if (field.kind === "integer" || field.kind === "number" || (field.kind === "reference" && field.referenceValueKind._tag === "Some" && field.referenceValueKind.value === "integer"))
        return Option.fromNullable(raw).pipe(Option.filter((value) => value !== ""), Option.map((value) => [field.name, Number(value)] as const));
      return Option.fromNullable(raw).pipe(Option.filter((value) => value !== ""), Option.map((value) => [field.name, value] as const));
    });
    const input = Object.fromEntries(entries);
    onSubmit(input);
  };
  return <form className="card form" onSubmit={submit}>
    {resource.fields.filter((field) => !field.readOnly).map((field) => <label key={field.name}>
      <span>{field.label}{field.required ? " *" : ""}</span>
      <FieldInput field={field} value={Option.flatMap(initial, (value) => Option.fromNullable(value[field.name]))} />
    </label>)}
    <div className="form-actions"><button type="submit">{Option.isNone(initial) ? "Create" : "Update"} {resource.singularLabel}</button>
      {Option.match(onCancel, { onNone: () => null, onSome: (cancel) => <button className="secondary" onClick={cancel} type="button">Cancel</button> })}</div>
  </form>;
}

function FieldInput({ field, value }: { readonly field: ResourceDefinition["fields"][number]; readonly value: Option.Option<unknown> }) {
  const defaultValue = Option.match(value, { onNone: () => "", onSome: String });
  switch (field.editor) {
    case "textarea": case "markdown": case "richText": case "table":
      return <textarea defaultValue={defaultValue} name={field.name} required={field.required} />;
    case "select":
      return <select defaultValue={defaultValue} name={field.name} required={field.required}>
        {field.enumValues.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>;
    case "resourceSelect":
      return <input defaultValue={defaultValue} name={field.name} required={field.required} type={field.referenceValueKind._tag === "Some" && field.referenceValueKind.value === "integer" ? "number" : "text"} />;
    case "checkbox":
      return <input defaultChecked={Option.exists(value, Boolean)} name={field.name} type="checkbox" />;
    case "datetime":
      return <input defaultValue={defaultValue} name={field.name} required={field.required} type="datetime-local" />;
    case "text": case "url": case "email": case "date": case "time": case "number":
      return <input defaultValue={defaultValue} name={field.name} required={field.required} type={field.editor} />;
  }
}
`;

const table = `import { Option } from "effect";
import type { ResourceDefinition } from "../resources.ts";

export function ResourceTable({ resource, rows, onDelete, onEdit }: {
  readonly resource: ResourceDefinition;
  readonly rows: ReadonlyArray<Record<string, unknown>>;
  readonly onDelete: (id: string) => void;
  readonly onEdit: (row: Record<string, unknown>) => void;
}) {
  return <div className="card table-wrap"><table><thead><tr>
    {resource.fields.map((field) => <th key={field.name}>{field.label}</th>)}<th>Actions</th>
  </tr></thead><tbody>{rows.map((row) => <tr key={String(row[resource.idField])}>
    {resource.fields.map((field) => <td key={field.name}>{renderValue(row[field.name], field.editor)}</td>)}
    <td className="actions"><button className="secondary" onClick={() => onEdit(row)}>Edit</button><button className="danger" onClick={() => onDelete(String(row[resource.idField]))}>Delete</button></td>
  </tr>)}</tbody></table></div>;
}

const renderValue = (value: unknown, editor: string) => {
  const text = Option.match(Option.fromNullable(value), { onNone: () => "—", onSome: String });
  if (editor === "url") return <a href={text} rel="noreferrer" target="_blank">{text}</a>;
  if (["textarea", "markdown", "richText"].includes(editor) && text.length > 120)
    return <details><summary>{text.slice(0, 120)}…</summary><p>{text}</p></details>;
  return text;
};
`;

const page = `import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Option } from "effect";
import { api } from "../api.ts";
import type { ResourceDefinition } from "../resources.ts";
import { ResourceForm } from "./ResourceForm.tsx";
import { ResourceTable } from "./ResourceTable.tsx";

export function ResourcePage({ resource }: { readonly resource: ResourceDefinition }) {
  const [editing, setEditing] = useState<Option.Option<Record<string, unknown>>>(Option.none());
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: [resource.name], queryFn: () => api.list(resource.name) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: [resource.name] });
  const create = useMutation({ mutationFn: (input: Record<string, unknown>) => api.create(resource.name, input), onSuccess: refresh });
  const update = useMutation({ mutationFn: ({ id, input }: { readonly id: string; readonly input: Record<string, unknown> }) => api.update(resource.name, id, input), onSuccess: () => { setEditing(Option.none()); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => api.remove(resource.name, id), onSuccess: refresh });
  const rows = Array.isArray(query.data) ? query.data as ReadonlyArray<Record<string, unknown>> : [];
  return <main><header><p className="eyebrow">API resource</p><h1>{resource.pluralLabel}</h1></header>
    <ResourceForm key={Option.match(editing, { onNone: () => "create", onSome: (value) => String(value[resource.idField]) })} resource={resource} initial={editing} onCancel={Option.map(editing, () => () => setEditing(Option.none()))} onSubmit={(input) => Option.match(editing, { onNone: () => create.mutate(input), onSome: (value) => update.mutate({ id: String(value[resource.idField]), input }) })} />
    {query.isLoading ? <p>Loading…</p> : query.error ? <p role="alert">{String(query.error)}</p>
      : <ResourceTable resource={resource} rows={rows} onDelete={(id) => remove.mutate(id)} onEdit={(row) => setEditing(Option.some(row))} />}
  </main>;
}
`;

const app = `import { useState } from "react";
import { resources, type ResourceDefinition } from "./resources.ts";
import { ResourcePage } from "./components/ResourcePage.tsx";

export function App() {
  const [selected, setSelected] = useState<ResourceDefinition>(resources[0]);
  return <div className="shell"><aside><div className="brand">API Explorer</div><nav>
    {resources.map((resource) => <button className={selected.name === resource.name ? "active" : ""}
      key={resource.name} onClick={() => setSelected(resource)}>{resource.pluralLabel}</button>)}
  </nav></aside><ResourcePage resource={selected} /></div>;
}
`;

const css = `:root{font-family:Inter,ui-sans-serif,system-ui;color:#172033;background:#f6f7fb}*{box-sizing:border-box}body{margin:0}.shell{display:grid;grid-template-columns:240px 1fr;min-height:100vh}aside{background:#111827;color:white;padding:28px 18px}.brand{font-size:20px;font-weight:750;margin:0 10px 32px}nav{display:grid;gap:6px}nav button{background:transparent;border:0;border-radius:8px;color:#9ca3af;padding:11px;text-align:left}nav button.active,nav button:hover{background:#263246;color:white}main{padding:48px;overflow:hidden}header{margin-bottom:24px}.eyebrow{color:#6366f1;font-weight:700;text-transform:uppercase;letter-spacing:.12em;font-size:12px}h1{font-size:36px;margin:4px 0}.card{background:white;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 1px 2px #0000000a;margin-bottom:24px}.form{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;padding:20px}.form label{display:grid;gap:7px;font-size:13px;font-weight:650}.form input,.form textarea,.form select{border:1px solid #d1d5db;border-radius:7px;padding:9px;font:inherit}.form button,button.danger,button.secondary{align-self:end;border:0;border-radius:7px;padding:10px 14px;background:#4f46e5;color:white}.form-actions,.actions{display:flex;gap:8px;align-items:end}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border-bottom:1px solid #eee;padding:13px;text-align:left;max-width:280px}th{background:#fafafa;color:#6b7280;font-size:12px;text-transform:uppercase}button.danger{background:#fff1f2;color:#be123c;padding:6px 9px}button.secondary{background:#eef2ff;color:#3730a3;padding:6px 9px}@media(max-width:760px){.shell{grid-template-columns:1fr}aside{padding:16px}.brand{margin-bottom:12px}nav{display:flex;overflow:auto}main{padding:24px}}`;

export const frontendUnits = {
  renderDataTransfer: (resource: ResourceIr) => renderInterface(resource),
  renderResourceMetadata: (api: ApiIr) =>
    Effect.gen(function* () {
      const json = yield* Json;
      return yield* json.stringify(metadata(api), null, 2);
    }),
  renderApiClient: () => apiClient,
  renderCreateUpdateForm: () => form,
  renderResourceTable: () => table,
  renderResourcePage: () => page,
  renderApplication: () => app,
} satisfies FrontendAdapterUnits;

export const frontendAdapter = defineAdapter({
  name: "tanstack-react",
  capabilities: completeCapabilities,
  units: frontendUnits,
  generate: (api) =>
    Effect.gen(function* () {
      const json = yield* Json;
      const resourceMetadata = yield* frontendUnits.renderResourceMetadata(api);
      const packageJson = yield* json.stringify(
        {
          name: `${api.api.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-web`,
          private: true,
          type: "module",
          scripts: { dev: "vite", build: "tsc --noEmit && vite build" },
          dependencies: {
            "@effect/platform": "0.97.0",
            "@tanstack/react-query": "5.83.0",
            "@vitejs/plugin-react": "4.6.0",
            vite: "7.0.4",
            react: "19.1.0",
            "react-dom": "19.1.0",
            effect: "3.22.0",
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
            exactOptionalPropertyTypes: true,
            allowImportingTsExtensions: true,
            jsx: "react-jsx",
            lib: ["ES2024", "DOM", "DOM.Iterable"],
            module: "ESNext",
            moduleResolution: "Bundler",
            noEmit: true,
            noUncheckedIndexedAccess: true,
            strict: true,
            target: "ES2024",
          },
          include: ["src"],
        },
        null,
        2,
      );
      return [
        {
          path: "web/package.json",
          contents: `${packageJson}\n`,
        },
        {
          path: "web/tsconfig.json",
          contents: `${tsconfig}\n`,
        },
        {
          path: "web/index.html",
          contents: '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
        },
        {
          path: "web/src/types.ts",
          contents: `import type { Option } from "effect";\n\n${api.resources.map(frontendUnits.renderDataTransfer).join("\n\n")}\n`,
        },
        {
          path: "web/src/resources.ts",
          contents: `type Maybe<Value> = { readonly _id: string; readonly _tag: "None" } | { readonly _id: string; readonly _tag: "Some"; readonly value: Value }\nexport interface ResourceDefinition {\n  readonly name: string;\n  readonly singularLabel: string;\n  readonly pluralLabel: string;\n  readonly idField: string;\n  readonly fields: ReadonlyArray<{ readonly name: string; readonly label: string; readonly kind: string; readonly editor: "text" | "textarea" | "markdown" | "richText" | "table" | "url" | "email" | "date" | "time" | "datetime" | "number" | "checkbox" | "select" | "resourceSelect"; readonly required: boolean; readonly readOnly: boolean; readonly referenceValueKind: Maybe<"string" | "integer">; readonly enumValues: ReadonlyArray<{ readonly value: string; readonly label: string }>; readonly [key: string]: unknown }>;\n  readonly relationships: ReadonlyArray<{ readonly name: string; readonly kind: "belongsTo" | "hasMany"; readonly resource: string; readonly localField: string; readonly foreignField: string }>;\n}\n\nexport const resources: readonly [ResourceDefinition, ...ReadonlyArray<ResourceDefinition>] = ${resourceMetadata};\n`,
        },
        { path: "web/src/api.ts", contents: frontendUnits.renderApiClient() },
        {
          path: "web/src/components/ResourceForm.tsx",
          contents: frontendUnits.renderCreateUpdateForm(),
        },
        {
          path: "web/src/components/ResourceTable.tsx",
          contents: frontendUnits.renderResourceTable(),
        },
        {
          path: "web/src/components/ResourcePage.tsx",
          contents: frontendUnits.renderResourcePage(),
        },
        { path: "web/src/App.tsx", contents: frontendUnits.renderApplication() },
        { path: "web/src/styles.css", contents: css },
        {
          path: "web/src/main.tsx",
          contents: `import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport { QueryClient, QueryClientProvider } from "@tanstack/react-query";\nimport { App } from "./App.tsx";\nimport "./styles.css";\n\nconst client = new QueryClient();\ncreateRoot(document.getElementById("root")!).render(<StrictMode><QueryClientProvider client={client}><App /></QueryClientProvider></StrictMode>);\n`,
        },
      ] satisfies ReadonlyArray<GeneratedFile>;
    }).pipe(
      Effect.mapError(
        (cause) =>
          new GenerationError({
            message: "Frontend adapter could not encode JSON",
            cause: Option.some(cause),
          }),
      ),
    ),
});
