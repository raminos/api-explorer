import { Effect } from "effect";
import { GenerationError } from "../domain/errors.ts";
import type { ApiIr } from "../ir/model.ts";
import { Json } from "../libraries/json.ts";
import { completeCapabilities, defineAdapter, type GeneratedFile } from "./adapter.ts";
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

const apiClient = `const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const api = {
  list: (resource: string) => fetch(\`\${baseUrl}/\${resource}\`).then(assertOk),
  get: (resource: string, id: string) => fetch(\`\${baseUrl}/\${resource}/\${id}\`).then(assertOk),
  create: (resource: string, input: unknown) => mutate(resource, "POST", input),
  update: (resource: string, id: string, input: unknown) => mutate(\`\${resource}/\${id}\`, "PATCH", input),
  remove: (resource: string, id: string) => mutate(\`\${resource}/\${id}\`, "DELETE"),
};

const mutate = (path: string, method: string, body?: unknown) =>
  fetch(\`\${baseUrl}/\${path}\`, {
    method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  }).then(assertOk);

const assertOk = async (response: Response): Promise<unknown> => {
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(\`Request failed: \${response.status}\`);
  return body;
};
`;

const form = `import type { FormEvent } from "react";
import type { ResourceDefinition } from "../resources.ts";

export function ResourceForm({ resource, initial, onCancel, onSubmit }: {
  readonly resource: ResourceDefinition;
  readonly initial: Record<string, unknown> | undefined;
  readonly onCancel: (() => void) | undefined;
  readonly onSubmit: (input: Record<string, unknown>) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = Object.fromEntries(resource.fields.filter((field) => !field.readOnly).map((field) => {
      const raw = data.get(field.name);
      if (field.kind === "boolean") return [field.name, data.has(field.name)];
      if (field.kind === "integer" || field.kind === "number" || (field.kind === "reference" && field.referenceValueKind === "integer"))
        return [field.name, raw === null || raw === "" ? undefined : Number(raw)];
      return [field.name, raw === null || raw === "" ? undefined : raw];
    }));
    onSubmit(input);
  };
  return <form className="card form" onSubmit={submit}>
    {resource.fields.filter((field) => !field.readOnly).map((field) => <label key={field.name}>
      <span>{field.label}{field.required ? " *" : ""}</span>
      <FieldInput field={field} value={initial?.[field.name]} />
    </label>)}
    <div className="form-actions"><button type="submit">{initial === undefined ? "Create" : "Update"} {resource.singularLabel}</button>
      {onCancel === undefined ? null : <button className="secondary" onClick={onCancel} type="button">Cancel</button>}</div>
  </form>;
}

function FieldInput({ field, value }: { readonly field: ResourceDefinition["fields"][number]; readonly value: unknown }) {
  const defaultValue = value === undefined || value === null ? undefined : String(value);
  switch (field.editor) {
    case "textarea": case "markdown": case "richText": case "table":
      return <textarea defaultValue={defaultValue} name={field.name} required={field.required} />;
    case "select":
      return <select defaultValue={defaultValue} name={field.name} required={field.required}>
        {field.enumValues.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>;
    case "resourceSelect":
      return <input defaultValue={defaultValue} name={field.name} required={field.required} type={field.referenceValueKind === "integer" ? "number" : "text"} />;
    case "checkbox":
      return <input defaultChecked={Boolean(value)} name={field.name} type="checkbox" />;
    case "datetime":
      return <input defaultValue={defaultValue} name={field.name} required={field.required} type="datetime-local" />;
    case "text": case "url": case "email": case "date": case "time": case "number":
      return <input defaultValue={defaultValue} name={field.name} required={field.required} type={field.editor} />;
  }
}
`;

const table = `import type { ResourceDefinition } from "../resources.ts";

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
  const text = String(value ?? "—");
  if (editor === "url") return <a href={text} rel="noreferrer" target="_blank">{text}</a>;
  if (["textarea", "markdown", "richText"].includes(editor) && text.length > 120)
    return <details><summary>{text.slice(0, 120)}…</summary><p>{text}</p></details>;
  return text;
};
`;

const page = `import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.ts";
import type { ResourceDefinition } from "../resources.ts";
import { ResourceForm } from "./ResourceForm.tsx";
import { ResourceTable } from "./ResourceTable.tsx";

export function ResourcePage({ resource }: { readonly resource: ResourceDefinition }) {
  const [editing, setEditing] = useState<Record<string, unknown> | undefined>();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: [resource.name], queryFn: () => api.list(resource.name) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: [resource.name] });
  const create = useMutation({ mutationFn: (input: Record<string, unknown>) => api.create(resource.name, input), onSuccess: refresh });
  const update = useMutation({ mutationFn: (input: Record<string, unknown>) => api.update(resource.name, String(editing?.[resource.idField]), input), onSuccess: () => { setEditing(undefined); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => api.remove(resource.name, id), onSuccess: refresh });
  const rows = Array.isArray(query.data) ? query.data as ReadonlyArray<Record<string, unknown>> : [];
  return <main><header><p className="eyebrow">API resource</p><h1>{resource.pluralLabel}</h1></header>
    <ResourceForm key={editing === undefined ? "create" : String(editing[resource.idField])} resource={resource} initial={editing} onCancel={editing === undefined ? undefined : () => setEditing(undefined)} onSubmit={(input) => editing === undefined ? create.mutate(input) : update.mutate(input)} />
    {query.isLoading ? <p>Loading…</p> : query.error ? <p role="alert">{String(query.error)}</p>
      : <ResourceTable resource={resource} rows={rows} onDelete={(id) => remove.mutate(id)} onEdit={setEditing} />}
  </main>;
}
`;

const app = `import { useState } from "react";
import { resources, type ResourceDefinition } from "./resources.ts";
import { ResourcePage } from "./components/ResourcePage.tsx";

export function App() {
  const [selected, setSelected] = useState<ResourceDefinition | undefined>(resources[0]);
  if (selected === undefined) return <p>No resources configured.</p>;
  return <div className="shell"><aside><div className="brand">API Explorer</div><nav>
    {resources.map((resource) => <button className={selected.name === resource.name ? "active" : ""}
      key={resource.name} onClick={() => setSelected(resource)}>{resource.pluralLabel}</button>)}
  </nav></aside><ResourcePage resource={selected} /></div>;
}
`;

const css = `:root{font-family:Inter,ui-sans-serif,system-ui;color:#172033;background:#f6f7fb}*{box-sizing:border-box}body{margin:0}.shell{display:grid;grid-template-columns:240px 1fr;min-height:100vh}aside{background:#111827;color:white;padding:28px 18px}.brand{font-size:20px;font-weight:750;margin:0 10px 32px}nav{display:grid;gap:6px}nav button{background:transparent;border:0;border-radius:8px;color:#9ca3af;padding:11px;text-align:left}nav button.active,nav button:hover{background:#263246;color:white}main{padding:48px;overflow:hidden}header{margin-bottom:24px}.eyebrow{color:#6366f1;font-weight:700;text-transform:uppercase;letter-spacing:.12em;font-size:12px}h1{font-size:36px;margin:4px 0}.card{background:white;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 1px 2px #0000000a;margin-bottom:24px}.form{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;padding:20px}.form label{display:grid;gap:7px;font-size:13px;font-weight:650}.form input,.form textarea,.form select{border:1px solid #d1d5db;border-radius:7px;padding:9px;font:inherit}.form button,button.danger,button.secondary{align-self:end;border:0;border-radius:7px;padding:10px 14px;background:#4f46e5;color:white}.form-actions,.actions{display:flex;gap:8px;align-items:end}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border-bottom:1px solid #eee;padding:13px;text-align:left;max-width:280px}th{background:#fafafa;color:#6b7280;font-size:12px;text-transform:uppercase}button.danger{background:#fff1f2;color:#be123c;padding:6px 9px}button.secondary{background:#eef2ff;color:#3730a3;padding:6px 9px}@media(max-width:760px){.shell{grid-template-columns:1fr}aside{padding:16px}.brand{margin-bottom:12px}nav{display:flex;overflow:auto}main{padding:24px}}`;

export const frontendAdapter = defineAdapter({
  name: "tanstack-react",
  capabilities: completeCapabilities,
  generate: (api) =>
    Effect.gen(function* () {
      const json = yield* Json;
      const resourceMetadata = yield* json.stringify(metadata(api), null, 2);
      const packageJson = yield* json.stringify(
        {
          name: `${api.api.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-web`,
          private: true,
          type: "module",
          scripts: { dev: "vite", build: "tsc --noEmit && vite build" },
          dependencies: {
            "@tanstack/react-query": "5.83.0",
            "@vitejs/plugin-react": "4.6.0",
            vite: "7.0.4",
            react: "19.1.0",
            "react-dom": "19.1.0",
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
          contents: `${api.resources.map(renderInterface).join("\n\n")}\n`,
        },
        {
          path: "web/src/resources.ts",
          contents: `export interface ResourceDefinition {\n  readonly name: string;\n  readonly singularLabel: string;\n  readonly pluralLabel: string;\n  readonly idField: string;\n  readonly fields: ReadonlyArray<{ readonly name: string; readonly label: string; readonly kind: string; readonly editor: "text" | "textarea" | "markdown" | "richText" | "table" | "url" | "email" | "date" | "time" | "datetime" | "number" | "checkbox" | "select" | "resourceSelect"; readonly required: boolean; readonly readOnly: boolean; readonly referenceValueKind?: "string" | "integer"; readonly enumValues: ReadonlyArray<{ readonly value: string; readonly label: string }>; readonly [key: string]: unknown }>;\n  readonly relationships: ReadonlyArray<{ readonly name: string; readonly kind: "belongsTo" | "hasMany"; readonly resource: string; readonly localField: string; readonly foreignField: string }>;\n}\n\nexport const resources: ReadonlyArray<ResourceDefinition> = ${resourceMetadata};\n`,
        },
        { path: "web/src/api.ts", contents: apiClient },
        { path: "web/src/components/ResourceForm.tsx", contents: form },
        { path: "web/src/components/ResourceTable.tsx", contents: table },
        { path: "web/src/components/ResourcePage.tsx", contents: page },
        { path: "web/src/App.tsx", contents: app },
        { path: "web/src/styles.css", contents: css },
        {
          path: "web/src/main.tsx",
          contents: `import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport { QueryClient, QueryClientProvider } from "@tanstack/react-query";\nimport { App } from "./App.tsx";\nimport "./styles.css";\n\nconst client = new QueryClient();\ncreateRoot(document.getElementById("root")!).render(<StrictMode><QueryClientProvider client={client}><App /></QueryClientProvider></StrictMode>);\n`,
        },
      ] satisfies ReadonlyArray<GeneratedFile>;
    }).pipe(
      Effect.mapError(
        (cause) =>
          new GenerationError({ message: "Frontend adapter could not encode JSON", cause }),
      ),
    ),
});
