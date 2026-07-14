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
    }),
  );

const apiClient = `import { FetchHttpClient, HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect, Option, Schema } from "effect";
import type { PaginationDefinition, ResourceDefinition } from "./resources.ts";
import { resourceSchemas } from "./schemas.ts";

const baseUrl = Option.getOrElse(Option.fromNullable(import.meta.env.VITE_API_URL), () => "http://localhost:3001");
const UnknownRecord = Schema.Record({ key: Schema.String, value: Schema.Unknown });

class ApiError extends Schema.TaggedError<ApiError>()("ApiError", { message: Schema.String, status: Schema.Number }) {}
export interface PaginationState { readonly offset: number; readonly page: number; readonly cursor: Option.Option<string> }
export interface PageResult { readonly rows: ReadonlyArray<Record<string, unknown>>; readonly nextCursor: Option.Option<string>; readonly totalItems: Option.Option<number>; readonly totalPages: Option.Option<number> }

export const initialPagination = (pagination: PaginationDefinition): PaginationState => ({
  offset: 0,
  page: pagination.type === "page" ? pagination.firstPage : 0,
  cursor: Option.none(),
});

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

const requestFor = (resource: ResourceDefinition, state: PaginationState) => {
  let request = HttpClientRequest.get(\`\${baseUrl}/\${resource.name}\`);
  if (resource.list._tag === "None") return request;
  const pagination = resource.list.value.pagination;
  switch (pagination.type) {
    case "none": return request;
    case "offset": return request.pipe(
      HttpClientRequest.setUrlParam(pagination.offsetParameter, String(state.offset)),
      HttpClientRequest.setUrlParam(pagination.limitParameter, String(pagination.defaultLimit)),
    );
    case "cursor": {
      request = HttpClientRequest.setUrlParam(request, pagination.limitParameter, String(pagination.defaultLimit));
      return Option.match(state.cursor, {
        onNone: () => request,
        onSome: (cursor) => HttpClientRequest.setUrlParam(request, pagination.cursorParameter, cursor),
      });
    }
    case "page": return request.pipe(
      HttpClientRequest.setUrlParam(pagination.pageParameter, String(state.page)),
      HttpClientRequest.setUrlParam(pagination.sizeParameter, String(pagination.defaultSize)),
    );
  }
};

const execute = (request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.execute(request);
    if (response.status < 200 || response.status >= 300) return yield* new ApiError({ message: "API request failed", status: response.status });
    return yield* response.json;
  });

const decodeMetric = (payload: unknown, path: string) =>
  Option.flatMap(atPath(payload, path), Schema.decodeUnknownOption(Schema.Number));

const decodePage = (resource: ResourceDefinition, payload: unknown): Effect.Effect<PageResult, ApiError> =>
  Effect.gen(function* () {
    if (resource.list._tag === "None") return yield* new ApiError({ message: "Resource has no list operation", status: 405 });
    const pagination = resource.list.value.pagination;
    const rawRowsOption = atPath(payload, pagination.response.itemsPath);
    if (Option.isNone(rawRowsOption)) return yield* new ApiError({ message: "Collection items path is missing", status: 502 });
    const rawRows = rawRowsOption.value;
    const schemaOption = Option.fromNullable(resourceSchemas[resource.name as keyof typeof resourceSchemas]);
    if (Option.isNone(schemaOption)) return yield* new ApiError({ message: "Resource has no response schema", status: 500 });
    const rows = yield* Schema.decodeUnknown(Schema.Array(schemaOption.value))(rawRows, { errors: "all", onExcessProperty: "error" }).pipe(
      Effect.mapError(() => new ApiError({ message: "API response failed schema validation", status: 502 })),
    );
    const records = rows as ReadonlyArray<Record<string, unknown>>;
    switch (pagination.type) {
      case "none": return { rows: records, nextCursor: Option.none(), totalItems: Option.none(), totalPages: Option.none() };
      case "offset": return {
        rows: records,
        nextCursor: Option.none(),
        totalItems: pagination.response.end.type === "totalItems" ? decodeMetric(payload, pagination.response.end.totalItemsPath) : Option.none(),
        totalPages: Option.none(),
      };
      case "cursor": return {
        rows: records,
        nextCursor: Option.flatMap(atPath(payload, pagination.nextCursorPath), Schema.decodeUnknownOption(Schema.NullOr(Schema.String))).pipe(Option.flatMap(Option.fromNullable)),
        totalItems: Option.none(),
        totalPages: Option.none(),
      };
      case "page": return { rows: records, nextCursor: Option.none(), totalItems: Option.none(), totalPages: decodeMetric(payload, pagination.response.totalPagesPath) };
    }
  });

const mutationRequest = (path: string, method: "POST" | "PATCH" | "DELETE", body: Option.Option<unknown>) =>
  Effect.gen(function* () {
    switch (method) {
      case "POST": return yield* HttpClientRequest.post(\`\${baseUrl}/\${path}\`).pipe(HttpClientRequest.bodyJson(Option.getOrNull(body)));
      case "PATCH": return yield* HttpClientRequest.patch(\`\${baseUrl}/\${path}\`).pipe(HttpClientRequest.bodyJson(Option.getOrNull(body)));
      case "DELETE": return HttpClientRequest.del(\`\${baseUrl}/\${path}\`);
    }
  });

const run = <Value>(effect: Effect.Effect<Value, unknown, HttpClient.HttpClient>) => effect.pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromise);
const mutate = (path: string, method: "POST" | "PATCH" | "DELETE", body: Option.Option<unknown>) => run(mutationRequest(path, method, body).pipe(Effect.flatMap(execute)));

export const api = {
  list: (resource: ResourceDefinition, state: PaginationState) => run(execute(requestFor(resource, state)).pipe(Effect.flatMap((payload) => decodePage(resource, payload)))),
  create: (resource: string, input: unknown) => mutate(resource, "POST", Option.some(input)),
  update: (resource: string, id: string, input: unknown) => mutate(\`\${resource}/\${id}\`, "PATCH", Option.some(input)),
  remove: (resource: string, id: string) => mutate(\`\${resource}/\${id}\`, "DELETE", Option.none()),
};
`;

const form = `import { useState, type FormEvent } from "react";
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
      if (field.nullable && data.has(\`\${field.name}__null\`)) return Option.some([field.name, null] as const);
      if (field.kind === "array") {
        const values = data.getAll(field.name).map(String).filter((value) => value.length > 0);
        if (!field.required && values.length === 0) return Option.none();
        const numeric = field.arrayElement._tag === "Some" && (field.arrayElement.value.kind === "integer" || field.arrayElement.value.kind === "number" || (field.arrayElement.value.kind === "reference" && field.arrayElement.value.referenceValueKind._tag === "Some" && field.arrayElement.value.referenceValueKind.value === "integer"));
        return Option.some([field.name, numeric ? values.map(Number) : values] as const);
      }
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
      {field.nullable ? <span className="nullable"><input name={\`\${field.name}__null\`} type="checkbox" /> Set to null</span> : null}
    </label>)}
    <div className="form-actions"><button type="submit">{Option.isNone(initial) ? "Create" : "Update"} {resource.singularLabel}</button>
      {Option.match(onCancel, { onNone: () => null, onSome: (cancel) => <button className="secondary" onClick={cancel} type="button">Cancel</button> })}</div>
  </form>;
}

function FieldInput({ field, value }: { readonly field: ResourceDefinition["fields"][number]; readonly value: Option.Option<unknown> }) {
  const defaultValue = Option.match(value, { onNone: () => "", onSome: String });
  switch (field.editor) {
    case "textarea": case "markdown": case "richText": case "table": case "code":
      return <textarea defaultValue={defaultValue} name={field.name} required={field.required} />;
    case "select":
      return <select defaultValue={defaultValue} name={field.name} required={field.required}>
        {field.enumValues.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>;
    case "resourceSelect":
      return <input defaultValue={defaultValue} name={field.name} required={field.required} type={field.referenceValueKind._tag === "Some" && field.referenceValueKind.value === "integer" ? "number" : "text"} />;
    case "multiSelect":
      return <select defaultValue={Option.match(value, { onNone: () => [], onSome: (item) => Array.isArray(item) ? item.map(String) : [] })} multiple name={field.name} required={field.required}>
        {field.arrayElement._tag === "Some" ? field.arrayElement.value.enumValues.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : null}
      </select>;
    case "resourceMultiSelect": case "repeatable":
      return <ArrayInput field={field} value={value} />;
    case "checkbox":
      return <input defaultChecked={Option.exists(value, Boolean)} name={field.name} type="checkbox" />;
    case "datetime":
      return <input defaultValue={defaultValue} name={field.name} required={field.required} type="datetime-local" />;
    case "password":
      return <input defaultValue={defaultValue} name={field.name} required={field.required} type="password" />;
    case "phone":
      return <input defaultValue={defaultValue} name={field.name} required={field.required} type="tel" />;
    case "image": case "url":
      return <input defaultValue={defaultValue} name={field.name} required={field.required} type="url" />;
    case "uuid": case "text":
      return <input defaultValue={defaultValue} name={field.name} required={field.required} type="text" />;
    case "email": case "date": case "time": case "number":
      return <input defaultValue={defaultValue} name={field.name} required={field.required} type={field.editor} />;
  }
}

function ArrayInput({ field, value }: { readonly field: ResourceDefinition["fields"][number]; readonly value: Option.Option<unknown> }) {
  const initial = Option.match(value, { onNone: () => [""], onSome: (item) => Array.isArray(item) && item.length > 0 ? item.map(String) : [""] });
  const [items, setItems] = useState<ReadonlyArray<string>>(initial);
  const remove = (index: number) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  return <div className="array-input">{items.map((item, index) => <div className="array-row" key={index}>
    <input defaultValue={item} name={field.name} required={field.required} type={field.arrayElement._tag === "Some" && (field.arrayElement.value.kind === "integer" || field.arrayElement.value.kind === "number") ? "number" : "text"} />
    <button className="secondary" onClick={() => remove(index)} type="button">Remove</button>
  </div>)}<button className="secondary" onClick={() => setItems((current) => [...current, ""])} type="button">Add value</button></div>;
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
    {resource.fields.filter((field) => !field.writeOnly).map((field) => <th key={field.name}>{field.label}</th>)}<th>Actions</th>
  </tr></thead><tbody>{rows.map((row) => <tr key={String(row[resource.idField])}>
    {resource.fields.filter((field) => !field.writeOnly).map((field) => <td key={field.name}>{renderValue(row[field.name], field)}</td>)}
    <td className="actions"><button className="secondary" onClick={() => onEdit(row)}>Edit</button><button className="danger" onClick={() => onDelete(String(row[resource.idField]))}>Delete</button></td>
  </tr>)}</tbody></table></div>;
}

const renderValue = (value: unknown, field: ResourceDefinition["fields"][number]) => {
  const text = Option.match(Option.fromNullable(value), { onNone: () => "—", onSome: String });
  switch (field.editor) {
    case "password": return "••••••••";
    case "image": return <a href={text} rel="noreferrer" target="_blank"><img alt={field.label} className="thumbnail" src={text} /></a>;
    case "url": return <a href={text} rel="noreferrer" target="_blank">{text}</a>;
    case "email": return <a href={\`mailto:\${text}\`}>{text}</a>;
    case "phone": return <a href={\`tel:\${text}\`}>{text}</a>;
    case "code": return <pre><code>{text}</code></pre>;
    case "multiSelect": case "resourceMultiSelect": case "repeatable":
      return <div className="badges">{Array.isArray(value) ? value.map((item) => <span className="badge" key={String(item)}>{String(item)}</span>) : null}</div>;
    case "textarea": case "markdown": case "richText": case "table":
      return text.length > 120 ? <details><summary>{text.slice(0, 120)}…</summary><p>{text}</p></details> : text;
    case "text": case "uuid": case "date": case "time": case "datetime": case "number": case "checkbox": case "select": case "resourceSelect": return text;
  }
};
`;

const page = `import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Array as EffectArray, Option } from "effect";
import { api, initialPagination, type PageResult, type PaginationState } from "../api.ts";
import type { PaginationDefinition, ResourceDefinition } from "../resources.ts";
import { ResourceForm } from "./ResourceForm.tsx";
import { ResourceTable } from "./ResourceTable.tsx";

export function ResourcePage({ resource }: { readonly resource: ResourceDefinition }) {
  const [editing, setEditing] = useState<Option.Option<Record<string, unknown>>>(Option.none());
  if (resource.list._tag === "None") throw new Error(\`Resource \${resource.name} has no list operation\`);
  const pagination = resource.list.value.pagination;
  const [paginationState, setPaginationState] = useState<PaginationState>(() => initialPagination(pagination));
  const [cursorPages, setCursorPages] = useState<ReadonlyArray<{ readonly key: string; readonly rows: ReadonlyArray<Record<string, unknown>> }>>([]);
  const queryClient = useQueryClient();
  const cursorKey = Option.getOrElse(paginationState.cursor, () => "__initial");
  const query = useQuery({ queryKey: [resource.name, paginationState], queryFn: () => api.list(resource, paginationState) });
  useEffect(() => {
    if (pagination.type !== "cursor" || !query.data) return;
    setCursorPages((pages) => pages.some(({ key }) => key === cursorKey) ? pages.map((page) => page.key === cursorKey ? { key: cursorKey, rows: query.data.rows } : page) : [...pages, { key: cursorKey, rows: query.data.rows }]);
  }, [cursorKey, pagination.type, query.data]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: [resource.name] });
  const create = useMutation({ mutationFn: (input: Record<string, unknown>) => api.create(resource.name, input), onSuccess: refresh });
  const update = useMutation({ mutationFn: ({ id, input }: { readonly id: string; readonly input: Record<string, unknown> }) => api.update(resource.name, id, input), onSuccess: () => { setEditing(Option.none()); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => api.remove(resource.name, id), onSuccess: refresh });
  const rows = pagination.type === "cursor" ? cursorPages.flatMap(({ rows: pageRows }) => pageRows) : Option.match(Option.fromNullable(query.data), { onNone: () => [], onSome: ({ rows: pageRows }) => pageRows });
  return <main><header><p className="eyebrow">API resource</p><h1>{resource.pluralLabel}</h1></header>
    <ResourceForm key={Option.match(editing, { onNone: () => "create", onSome: (value) => String(value[resource.idField]) })} resource={resource} initial={editing} onCancel={Option.map(editing, () => () => setEditing(Option.none()))} onSubmit={(input) => Option.match(editing, { onNone: () => create.mutate(input), onSome: (value) => update.mutate({ id: String(value[resource.idField]), input }) })} />
    {query.isLoading ? <p>Loading…</p> : query.error ? <p role="alert">{String(query.error)}</p>
      : <><ResourceTable resource={resource} rows={rows} onDelete={(id) => remove.mutate(id)} onEdit={(row) => setEditing(Option.some(row))} />
        <PaginationControls pagination={pagination} result={Option.fromNullable(query.data)} state={paginationState} onChange={setPaginationState} />
      </>}
  </main>;
}

function PaginationControls({ pagination, result, state, onChange }: { readonly pagination: PaginationDefinition; readonly result: Option.Option<PageResult>; readonly state: PaginationState; readonly onChange: (state: PaginationState) => void }) {
  switch (pagination.type) {
    case "none": return null;
    case "cursor": return <nav aria-label="Pagination" className="pagination"><button disabled={Option.flatMap(result, ({ nextCursor }) => nextCursor)._tag === "None"} onClick={() => Option.map(Option.flatMap(result, ({ nextCursor }) => nextCursor), (cursor) => onChange({ ...state, cursor: Option.some(cursor) }))}>Load more</button></nav>;
    case "offset": {
      const canMoveNext = Option.match(result, { onNone: () => false, onSome: ({ rows, totalItems }) => pagination.response.end.type === "shortPage" ? rows.length === pagination.defaultLimit : Option.exists(totalItems, (total) => state.offset + pagination.defaultLimit < total) });
      return <nav aria-label="Pagination" className="pagination"><button disabled={state.offset === 0} onClick={() => onChange({ ...state, offset: Math.max(0, state.offset - pagination.defaultLimit) })}>Previous</button><span>Items {state.offset + 1}–{state.offset + Option.match(result, { onNone: () => 0, onSome: ({ rows }) => rows.length })}</span><button disabled={!canMoveNext} onClick={() => onChange({ ...state, offset: state.offset + pagination.defaultLimit })}>Next</button></nav>;
    }
    case "page": {
      const totalPages = Option.flatMap(result, ({ totalPages }) => totalPages);
      const pages = Option.match(totalPages, { onNone: () => [], onSome: (total) => EffectArray.range(pagination.firstPage, pagination.firstPage + total - 1) });
      return <nav aria-label="Pagination" className="pagination"><button disabled={state.page === pagination.firstPage} onClick={() => onChange({ ...state, page: state.page - 1 })}>Previous</button>{pages.map((page) => <button aria-current={page === state.page ? "page" : false} className={page === state.page ? "active" : ""} key={page} onClick={() => onChange({ ...state, page })}>{page}</button>)}<button disabled={Option.match(totalPages, { onNone: () => true, onSome: (total) => state.page >= pagination.firstPage + total - 1 })} onClick={() => onChange({ ...state, page: state.page + 1 })}>Next</button></nav>;
    }
  }
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
  </nav></aside><ResourcePage key={selected.name} resource={selected} /></div>;
}
`;

const css = `:root{font-family:Inter,ui-sans-serif,system-ui;color:#172033;background:#f6f7fb}*{box-sizing:border-box}body{margin:0}.shell{display:grid;grid-template-columns:240px 1fr;min-height:100vh}aside{background:#111827;color:white;padding:28px 18px}.brand{font-size:20px;font-weight:750;margin:0 10px 32px}nav{display:grid;gap:6px}nav button{background:transparent;border:0;border-radius:8px;color:#9ca3af;padding:11px;text-align:left}nav button.active,nav button:hover{background:#263246;color:white}main{padding:48px;overflow:hidden}header{margin-bottom:24px}.eyebrow{color:#6366f1;font-weight:700;text-transform:uppercase;letter-spacing:.12em;font-size:12px}h1{font-size:36px;margin:4px 0}.card{background:white;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 1px 2px #0000000a;margin-bottom:24px}.form{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;padding:20px}.form label{display:grid;gap:7px;font-size:13px;font-weight:650}.form input,.form textarea,.form select{border:1px solid #d1d5db;border-radius:7px;padding:9px;font:inherit}.form textarea{min-height:110px}.form select[multiple]{min-height:120px}.form button,button.danger,button.secondary,.pagination button{align-self:end;border:0;border-radius:7px;padding:10px 14px;background:#4f46e5;color:white}.form-actions,.actions,.array-row,.pagination{display:flex;gap:8px;align-items:center}.array-input{display:grid;gap:8px}.array-row input{flex:1}.nullable{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;font-weight:400!important}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border-bottom:1px solid #eee;padding:13px;text-align:left;max-width:280px}th{background:#fafafa;color:#6b7280;font-size:12px;text-transform:uppercase}pre{overflow:auto;white-space:pre-wrap}.thumbnail{border-radius:8px;display:block;height:48px;object-fit:cover;width:48px}.badges{display:flex;flex-wrap:wrap;gap:4px}.badge{background:#eef2ff;border-radius:999px;color:#3730a3;padding:3px 8px}.pagination{display:flex;justify-content:center;margin:18px 0}.pagination button{background:white;border:1px solid #d1d5db;color:#172033}.pagination button.active{background:#172033;color:white}.pagination button:disabled{cursor:not-allowed;opacity:.45}button.danger{background:#fff1f2;color:#be123c;padding:6px 9px}button.secondary{background:#eef2ff;color:#3730a3;padding:6px 9px}@media(max-width:760px){.shell{grid-template-columns:1fr}aside{padding:16px}.brand{margin-bottom:12px}nav{display:flex;overflow:auto}main{padding:24px}}`;

export interface TanStackShadcnUnits {
  readonly renderDataTransfer: (resource: ResourceIr) => string;
  readonly renderResourceMetadata: (
    api: ApiIr,
  ) => Effect.Effect<string, import("../../../libraries/errors.ts").LibraryError, Json>;
  readonly renderApiClient: () => string;
  readonly renderCreateUpdateForm: () => string;
  readonly renderResourceTable: () => string;
  readonly renderResourcePage: () => string;
  readonly renderApplication: () => string;
}

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
} satisfies TanStackShadcnUnits;

export const projectPrimitive = definePrimitive(
  { id: "project", description: "Render the Vite package and strict TypeScript project" },
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
      ] satisfies ReadonlyArray<GeneratedFile>;
    }).pipe(
      Effect.mapError(
        (cause) =>
          new GenerationError({
            message: "TanStack project primitive could not encode JSON",
            cause: Option.some(cause),
          }),
      ),
      Effect.provide(Json.Default),
    ),
);

export const contractsPrimitive = definePrimitive(
  { id: "contracts", description: "Render browser schemas, types, and resource metadata" },
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
  | { readonly type: "page"; readonly pageParameter: string; readonly sizeParameter: string; readonly defaultSize: number; readonly firstPage: number; readonly response: ResponseItems & { readonly totalPagesPath: string } };
interface ListOperation { readonly method: "GET"; readonly path: string; readonly pagination: PaginationDefinition }
export interface ResourceDefinition { readonly name: string; readonly singularLabel: string; readonly pluralLabel: string; readonly idField: string; readonly fields: ReadonlyArray<FieldDefinition>; readonly relationships: ReadonlyArray<{ readonly name: string; readonly kind: "belongsTo" | "hasMany"; readonly resource: string; readonly localField: string; readonly foreignField: string }>; readonly list: Maybe<ListOperation> }

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
            message: "TanStack contract primitive could not encode metadata",
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
  { id: "resource-components", description: "Render forms, tables, and resource pages" },
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
      {
        path: "web/src/components/ResourcePage.tsx",
        contents: frontendUnits.renderResourcePage(),
      },
    ]),
);

export const applicationPrimitive = definePrimitive(
  { id: "application", description: "Render the dashboard shell, styles, and entrypoint" },
  () =>
    Effect.succeed([
      { path: "web/src/App.tsx", contents: frontendUnits.renderApplication() },
      { path: "web/src/styles.css", contents: css },
      {
        path: "web/src/main.tsx",
        contents: `import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport { QueryClient, QueryClientProvider } from "@tanstack/react-query";\nimport { App } from "./App.tsx";\nimport "./styles.css";\n\nconst client = new QueryClient();\ncreateRoot(document.getElementById("root")!).render(<StrictMode><QueryClientProvider client={client}><App /></QueryClientProvider></StrictMode>);\n`,
      },
    ]),
);

export const frontendAdapter = defineAdapter({
  metadata: {
    id: "tanstack-shadcn",
    kind: "frontend",
    displayName: "TanStack/ShadCN",
    description: "TanStack Query React explorer with ShadCN interaction patterns",
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
