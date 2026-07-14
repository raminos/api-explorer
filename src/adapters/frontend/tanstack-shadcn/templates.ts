import type { GeneratedFile } from "../../../generator/adapter.ts";

export const apiClientTemplate = `import { FetchHttpClient, HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect, Option, Schema } from "effect";
import type { PaginationDefinition, ResourceDefinition } from "./resources.ts";
import { resourceSchemas } from "./schemas.ts";

const baseUrl = Option.getOrElse(Option.fromNullable(import.meta.env.VITE_API_URL), () => "/api");
const UnknownRecord = Schema.Record({ key: Schema.String, value: Schema.Unknown });

export class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  message: Schema.String,
  status: Schema.Number,
}) {}

export interface PaginationState {
  readonly offset: number;
  readonly page: number;
  readonly cursor: Option.Option<string>;
}

export interface PageResult {
  readonly rows: ReadonlyArray<Record<string, unknown>>;
  readonly nextCursor: Option.Option<string>;
  readonly totalItems: Option.Option<number>;
  readonly totalPages: Option.Option<number>;
}

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
  let request = HttpClientRequest.get(baseUrl + "/" + resource.name);
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
    if (response.status < 200 || response.status >= 300) {
      return yield* new ApiError({ message: "The API returned an unsuccessful response.", status: response.status });
    }
    return yield* response.json;
  });

const decodeMetric = (payload: unknown, path: string) =>
  Option.flatMap(atPath(payload, path), Schema.decodeUnknownOption(Schema.Number));

const decodePage = (resource: ResourceDefinition, payload: unknown): Effect.Effect<PageResult, ApiError> =>
  Effect.gen(function* () {
    if (resource.list._tag === "None") return yield* new ApiError({ message: "This resource cannot be listed.", status: 405 });
    const pagination = resource.list.value.pagination;
    const rawRows = atPath(payload, pagination.response.itemsPath);
    if (Option.isNone(rawRows)) return yield* new ApiError({ message: "The collection path is missing from the API response.", status: 502 });
    const schema = Option.fromNullable(resourceSchemas[resource.name as keyof typeof resourceSchemas]);
    if (Option.isNone(schema)) return yield* new ApiError({ message: "The resource response schema is missing.", status: 500 });
    const rows = yield* Schema.decodeUnknown(Schema.Array(schema.value))(rawRows.value, {
      errors: "all",
      onExcessProperty: "error",
    }).pipe(
      Effect.mapError(() => new ApiError({ message: "The API response does not match the declared contract.", status: 502 })),
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
      case "page": return {
        rows: records,
        nextCursor: Option.none(),
        totalItems: Option.none(),
        totalPages: pagination.response.end.type === "totalPages" ? decodeMetric(payload, pagination.response.end.totalPagesPath) : Option.none(),
      };
    }
  });

const mutationRequest = (path: string, method: "POST" | "PATCH" | "DELETE", body: Option.Option<unknown>) =>
  Effect.gen(function* () {
    switch (method) {
      case "POST": return yield* HttpClientRequest.post(baseUrl + "/" + path).pipe(HttpClientRequest.bodyJson(Option.getOrNull(body)));
      case "PATCH": return yield* HttpClientRequest.patch(baseUrl + "/" + path).pipe(HttpClientRequest.bodyJson(Option.getOrNull(body)));
      case "DELETE": return HttpClientRequest.del(baseUrl + "/" + path);
    }
  });

const run = <Value>(effect: Effect.Effect<Value, unknown, HttpClient.HttpClient>) =>
  effect.pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromise);
const mutate = (path: string, method: "POST" | "PATCH" | "DELETE", body: Option.Option<unknown>) =>
  run(mutationRequest(path, method, body).pipe(Effect.flatMap(execute)));

export const api = {
  list: (resource: ResourceDefinition, state: PaginationState) =>
    run(execute(requestFor(resource, state)).pipe(Effect.flatMap((payload) => decodePage(resource, payload)))),
  create: (resource: string, input: unknown) => mutate(resource, "POST", Option.some(input)),
  update: (resource: string, id: string, input: unknown) => mutate(resource + "/" + id, "PATCH", Option.some(input)),
  remove: (resource: string, id: string) => mutate(resource + "/" + id, "DELETE", Option.none()),
};
`;

export const formTemplate = `import { useState, type FormEvent } from "react";
import { Array as EffectArray, Option } from "effect";
import type { ResourceDefinition } from "../resources.ts";
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";
import { Textarea } from "./ui/textarea.tsx";

export function ResourceForm({ resource, initial, onCancel, onSubmit }: {
  readonly resource: ResourceDefinition;
  readonly initial: Option.Option<Record<string, unknown>>;
  readonly onCancel: Option.Option<() => void>;
  readonly onSubmit: (input: Record<string, unknown>) => void;
}) {
  const writableFields = resource.fields.filter((field) => !field.readOnly);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const entries = EffectArray.filterMap(writableFields, (field): Option.Option<readonly [string, unknown]> => {
      const raw = data.get(field.name);
      if (field.nullable && data.has(field.name + "__null")) return Option.some([field.name, null] as const);
      if (field.kind === "array") {
        const values = data.getAll(field.name).map(String).filter((value) => value.length > 0);
        if (!field.required && values.length === 0) return Option.none();
        const numeric = field.arrayElement._tag === "Some" && (field.arrayElement.value.kind === "integer" || field.arrayElement.value.kind === "number");
        return Option.some([field.name, numeric ? values.map(Number) : values] as const);
      }
      if (field.kind === "boolean") return Option.some([field.name, data.has(field.name)] as const);
      if (field.kind === "integer" || field.kind === "number") {
        return Option.fromNullable(raw).pipe(Option.filter((value) => value !== ""), Option.map((value) => [field.name, Number(value)] as const));
      }
      return Option.fromNullable(raw).pipe(Option.filter((value) => value !== ""), Option.map((value) => [field.name, value] as const));
    });
    onSubmit(Object.fromEntries(entries));
  };

  return <Card>
    <CardHeader>
      <CardTitle>{Option.isNone(initial) ? "Create" : "Update"} {resource.singularLabel}</CardTitle>
      <CardDescription>Fields are generated from the validated API contract.</CardDescription>
    </CardHeader>
    <form onSubmit={submit}>
      <CardContent className="grid gap-5 md:grid-cols-2">
        {writableFields.map((field) => <div className="grid gap-2" key={field.name}>
          <Label htmlFor={field.name}>{field.label}{field.required ? " *" : ""}</Label>
          <FieldInput field={field} value={Option.flatMap(initial, (value) => Option.fromNullable(value[field.name]))} />
          {field.description._tag === "Some" ? <p className="text-xs text-muted-foreground">{field.description.value}</p> : null}
          {field.nullable ? <Label className="flex items-center gap-2 text-xs font-normal text-muted-foreground"><input name={field.name + "__null"} type="checkbox" /> Set to null</Label> : null}
        </div>)}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        {Option.match(onCancel, { onNone: () => null, onSome: (cancel) => <Button onClick={cancel} type="button" variant="outline">Cancel</Button> })}
        <Button type="submit">{Option.isNone(initial) ? "Create" : "Save changes"}</Button>
      </CardFooter>
    </form>
  </Card>;
}

function FieldInput({ field, value }: { readonly field: ResourceDefinition["fields"][number]; readonly value: Option.Option<unknown> }) {
  const defaultValue = Option.match(value, { onNone: () => "", onSome: String });
  switch (field.editor) {
    case "textarea": case "markdown": case "richText": case "table": case "code":
      return <Textarea defaultValue={defaultValue} id={field.name} name={field.name} required={field.required} rows={5} />;
    case "select":
      return <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs" defaultValue={defaultValue} id={field.name} name={field.name} required={field.required}>
        <option disabled value="">Select an option</option>
        {field.enumValues.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>;
    case "multiSelect":
      return <select className="min-h-28 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs" defaultValue={Option.match(value, { onNone: () => [], onSome: (item) => Array.isArray(item) ? item.map(String) : [] })} id={field.name} multiple name={field.name} required={field.required}>
        {field.arrayElement._tag === "Some" ? field.arrayElement.value.enumValues.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : null}
      </select>;
    case "resourceMultiSelect": case "repeatable": return <ArrayInput field={field} value={value} />;
    case "checkbox": return <input className="size-4 rounded border-input" defaultChecked={Option.exists(value, Boolean)} id={field.name} name={field.name} type="checkbox" />;
    case "datetime": return <Input defaultValue={defaultValue} id={field.name} name={field.name} required={field.required} type="datetime-local" />;
    case "password": return <Input defaultValue={defaultValue} id={field.name} name={field.name} required={field.required} type="password" />;
    case "phone": return <Input defaultValue={defaultValue} id={field.name} name={field.name} required={field.required} type="tel" />;
    case "image": case "url": return <Input defaultValue={defaultValue} id={field.name} name={field.name} required={field.required} type="url" />;
    case "resourceSelect": return <Input defaultValue={defaultValue} id={field.name} name={field.name} required={field.required} type={field.referenceValueKind._tag === "Some" && field.referenceValueKind.value === "integer" ? "number" : "text"} />;
    case "uuid": case "text": return <Input defaultValue={defaultValue} id={field.name} name={field.name} required={field.required} type="text" />;
    case "email": case "date": case "time": case "number": return <Input defaultValue={defaultValue} id={field.name} name={field.name} required={field.required} type={field.editor} />;
  }
}

function ArrayInput({ field, value }: { readonly field: ResourceDefinition["fields"][number]; readonly value: Option.Option<unknown> }) {
  const initial = Option.match(value, { onNone: () => [""], onSome: (item) => Array.isArray(item) && item.length > 0 ? item.map(String) : [""] });
  const [items, setItems] = useState<ReadonlyArray<string>>(initial);
  return <div className="grid gap-2">
    {items.map((item, index) => <div className="flex gap-2" key={index}>
      <Input defaultValue={item} name={field.name} required={field.required} />
      <Button onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button" variant="outline">Remove</Button>
    </div>)}
    <Button className="w-fit" onClick={() => setItems((current) => [...current, ""])} type="button" variant="outline">Add value</Button>
  </div>;
}
`;

export const tableTemplate = `import { Option } from "effect";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import type { ResourceDefinition } from "../resources.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table.tsx";

export function ResourceTable({ resource, rows, onDelete, onEdit }: {
  readonly resource: ResourceDefinition;
  readonly rows: ReadonlyArray<Record<string, unknown>>;
  readonly onDelete: (id: string) => void;
  readonly onEdit: (row: Record<string, unknown>) => void;
}) {
  const fields = resource.fields
    .filter((field) => !field.writeOnly && field.name !== resource.idField)
    .filter((field) => rows.some((row) => row[field.name] != null))
    .slice(0, 8);
  const hasActions = resource.update._tag === "Some" || resource.delete._tag === "Some";
  return <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          {fields.map((field) => <TableHead key={field.name}>{field.label}</TableHead>)}
          {hasActions ? <TableHead className="w-24 text-right">Actions</TableHead> : null}
        </TableRow></TableHeader>
        <TableBody>{rows.map((row) => <TableRow key={String(row[resource.idField])}>
          {fields.map((field) => <TableCell key={field.name}>{renderValue(row[field.name], field)}</TableCell>)}
          {hasActions ? <TableCell><div className="flex justify-end gap-1">
            {resource.update._tag === "Some" ? <Button aria-label="Edit" onClick={() => onEdit(row)} size="icon" variant="ghost"><Pencil /></Button> : null}
            {resource.delete._tag === "Some" ? <Button aria-label="Delete" onClick={() => onDelete(String(row[resource.idField]))} size="icon" variant="ghost"><Trash2 /></Button> : null}
          </div></TableCell> : null}
        </TableRow>)}</TableBody>
      </Table>
    </div>
  </div>;
}

const renderValue = (value: unknown, field: ResourceDefinition["fields"][number]) => {
  const text = Option.match(Option.fromNullable(value), { onNone: () => "—", onSome: String });
  switch (field.editor) {
    case "password": return <span className="text-muted-foreground">••••••••</span>;
    case "image": return <a href={text} rel="noreferrer" target="_blank"><img alt={field.label} className="size-9 rounded-full border object-cover" src={text} /></a>;
    case "url": return value == null ? <span className="text-muted-foreground">—</span> : <a className="inline-flex max-w-48 items-center gap-1 truncate font-medium text-primary hover:underline" href={text} rel="noreferrer" target="_blank">Visit <ExternalLink className="size-3" /></a>;
    case "email": return <a className="text-primary hover:underline" href={"mailto:" + text}>{text}</a>;
    case "phone": return value == null ? <span className="text-muted-foreground">—</span> : <a className="whitespace-nowrap text-primary hover:underline" href={"tel:" + text}>{text}</a>;
    case "code": return <code className="rounded bg-muted px-1.5 py-1 font-mono text-xs">{text}</code>;
    case "select": return <Badge variant="secondary">{field.enumValues.find((item) => item.value === text)?.label ?? text}</Badge>;
    case "multiSelect": case "resourceMultiSelect": case "repeatable":
      return <div className="flex flex-wrap gap-1">{Array.isArray(value) ? value.map((item) => <Badge key={String(item)} variant="secondary">{String(item)}</Badge>) : null}</div>;
    case "textarea": case "markdown": case "richText": case "table": return <span className="line-clamp-2 max-w-72 text-muted-foreground">{text}</span>;
    case "datetime": return <span className="whitespace-nowrap">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(text))}</span>;
    case "checkbox": return <Badge variant={value ? "default" : "outline"}>{value ? "Yes" : "No"}</Badge>;
    case "text": case "uuid": case "date": case "time": case "number": case "resourceSelect": return <span className={field.name === "name" ? "font-medium text-foreground" : "text-muted-foreground"}>{text}</span>;
  }
};
`;

export const pageTemplate = `import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Array as EffectArray, Option } from "effect";
import { AlertCircle, Braces, Database, RefreshCw } from "lucide-react";
import { api, initialPagination, type PageResult, type PaginationState } from "../api.ts";
import type { PaginationDefinition, ResourceDefinition } from "../resources.ts";
import { ResourceForm } from "./ResourceForm.tsx";
import { ResourceTable } from "./ResourceTable.tsx";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert.tsx";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Card, CardContent } from "./ui/card.tsx";
import { Skeleton } from "./ui/skeleton.tsx";

export function ResourcePage({ resource }: { readonly resource: ResourceDefinition }) {
  if (resource.list._tag === "None") throw new Error("Resource " + resource.name + " has no list operation");
  const pagination = resource.list.value.pagination;
  const [editing, setEditing] = useState<Option.Option<Record<string, unknown>>>(Option.none());
  const [paginationState, setPaginationState] = useState<PaginationState>(() => initialPagination(pagination));
  const [cursorPages, setCursorPages] = useState<ReadonlyArray<{ readonly key: string; readonly rows: ReadonlyArray<Record<string, unknown>> }>>([]);
  const queryClient = useQueryClient();
  const cursorKey = Option.getOrElse(paginationState.cursor, () => "__initial");
  const query = useQuery({ queryKey: [resource.name, paginationState], queryFn: () => api.list(resource, paginationState), retry: 1 });
  useEffect(() => {
    if (pagination.type !== "cursor" || !query.data) return;
    setCursorPages((pages) => pages.some(({ key }) => key === cursorKey)
      ? pages.map((item) => item.key === cursorKey ? { key: cursorKey, rows: query.data.rows } : item)
      : [...pages, { key: cursorKey, rows: query.data.rows }]);
  }, [cursorKey, pagination.type, query.data]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: [resource.name] });
  const create = useMutation({ mutationFn: (input: Record<string, unknown>) => api.create(resource.name, input), onSuccess: refresh });
  const update = useMutation({ mutationFn: ({ id, input }: { readonly id: string; readonly input: Record<string, unknown> }) => api.update(resource.name, id, input), onSuccess: () => { setEditing(Option.none()); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => api.remove(resource.name, id), onSuccess: refresh });
  const rows = pagination.type === "cursor" ? cursorPages.flatMap(({ rows: pageRows }) => pageRows) : Option.match(Option.fromNullable(query.data), { onNone: () => [], onSome: ({ rows: pageRows }) => pageRows });
  const canCreate = resource.create._tag === "Some";

  return <main className="min-w-0 flex-1 bg-muted/30">
    <div className="mx-auto max-w-[1600px] space-y-6 px-5 py-8 lg:px-10 lg:py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-2"><Badge variant="outline"><span className="mr-1.5 size-1.5 rounded-full bg-emerald-500" />Live API</Badge><Badge variant="secondary">GET</Badge></div>
          <div><h1 className="text-3xl font-semibold tracking-tight">{resource.pluralLabel}</h1><p className="mt-1 text-sm text-muted-foreground">Explore schema-validated records from the provider.</p></div>
        </div>
        <Button disabled={query.isFetching} onClick={() => query.refetch()} variant="outline"><RefreshCw className={query.isFetching ? "animate-spin" : ""} />Refresh</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<Database />} label="Records on this page" value={query.isLoading ? "—" : String(rows.length)} />
        <Stat icon={<Braces />} label="Contract fields" value={String(resource.fields.length)} />
        <Stat icon={<AlertCircle />} label="Validation" value="Strict" />
      </div>

      {canCreate || Option.isSome(editing) ? <ResourceForm key={Option.match(editing, { onNone: () => "create", onSome: (value) => String(value[resource.idField]) })} resource={resource} initial={editing} onCancel={Option.map(editing, () => () => setEditing(Option.none()))} onSubmit={(input) => Option.match(editing, { onNone: () => create.mutate(input), onSome: (value) => update.mutate({ id: String(value[resource.idField]), input }) })} /> : null}

      {query.isLoading ? <LoadingTable /> : query.error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>Could not load {resource.pluralLabel.toLowerCase()}</AlertTitle><AlertDescription>{query.error instanceof Error ? query.error.message : "The request failed."}</AlertDescription></Alert>
        : rows.length === 0 ? <Card><CardContent className="flex min-h-48 flex-col items-center justify-center text-center"><Database className="mb-3 size-8 text-muted-foreground" /><p className="font-medium">No records found</p><p className="text-sm text-muted-foreground">The provider returned an empty page.</p></CardContent></Card>
        : <div className="space-y-4"><ResourceTable resource={resource} rows={rows} onDelete={(id) => remove.mutate(id)} onEdit={(row) => setEditing(Option.some(row))} /><PaginationControls pagination={pagination} result={Option.fromNullable(query.data)} state={paginationState} onChange={setPaginationState} /></div>}
    </div>
  </main>;
}

function Stat({ icon, label, value }: { readonly icon: React.ReactNode; readonly label: string; readonly value: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">{icon}</div><div><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div></CardContent></Card>;
}

function LoadingTable() {
  return <div className="space-y-3 rounded-xl border bg-card p-5">{EffectArray.range(1, 7).map((row) => <Skeleton className="h-10 w-full" key={row} />)}</div>;
}

function PaginationControls({ pagination, result, state, onChange }: { readonly pagination: PaginationDefinition; readonly result: Option.Option<PageResult>; readonly state: PaginationState; readonly onChange: (state: PaginationState) => void }) {
  switch (pagination.type) {
    case "none": return null;
    case "cursor": return <div className="flex justify-center"><Button disabled={Option.isNone(Option.flatMap(result, ({ nextCursor }) => nextCursor))} onClick={() => Option.map(Option.flatMap(result, ({ nextCursor }) => nextCursor), (cursor) => onChange({ ...state, cursor: Option.some(cursor) }))} variant="outline">Load more</Button></div>;
    case "offset": {
      const canMoveNext = Option.match(result, { onNone: () => false, onSome: ({ rows, totalItems }) => pagination.response.end.type === "shortPage" ? rows.length === pagination.defaultLimit : Option.exists(totalItems, (total) => state.offset + pagination.defaultLimit < total) });
      return <PaginationFrame label={"Items " + (state.offset + 1) + "–" + (state.offset + Option.match(result, { onNone: () => 0, onSome: ({ rows }) => rows.length }))} nextDisabled={!canMoveNext} previousDisabled={state.offset === 0} onNext={() => onChange({ ...state, offset: state.offset + pagination.defaultLimit })} onPrevious={() => onChange({ ...state, offset: Math.max(0, state.offset - pagination.defaultLimit) })} />;
    }
    case "page": {
      const totalPages = Option.flatMap(result, ({ totalPages }) => totalPages);
      const hasFullPage = Option.exists(result, ({ rows }) => rows.length === pagination.defaultSize);
      const nextDisabled = pagination.response.end.type === "shortPage" ? !hasFullPage : Option.match(totalPages, { onNone: () => true, onSome: (total) => state.page >= pagination.firstPage + total - 1 });
      return <PaginationFrame label={"Page " + state.page} nextDisabled={nextDisabled} previousDisabled={state.page === pagination.firstPage} onNext={() => onChange({ ...state, page: state.page + 1 })} onPrevious={() => onChange({ ...state, page: state.page - 1 })} />;
    }
  }
}

function PaginationFrame({ label, nextDisabled, previousDisabled, onNext, onPrevious }: { readonly label: string; readonly nextDisabled: boolean; readonly previousDisabled: boolean; readonly onNext: () => void; readonly onPrevious: () => void }) {
  return <nav aria-label="Pagination" className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><div className="flex gap-2"><Button disabled={previousDisabled} onClick={onPrevious} variant="outline">Previous</Button><Button disabled={nextDisabled} onClick={onNext} variant="outline">Next</Button></div></nav>;
}
`;

export const applicationTemplate = (
  apiName: string,
  description: string,
) => `import { useState } from "react";
import { Braces, ChevronRight, Code2, Database } from "lucide-react";
import { resources, type ResourceDefinition } from "./resources.ts";
import { ResourcePage } from "./components/ResourcePage.tsx";
import { Badge } from "./components/ui/badge.tsx";

export function App() {
  const [selected, setSelected] = useState<ResourceDefinition>(resources[0]);
  return <div className="min-h-screen bg-background lg:flex">
    <aside className="border-b bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
      <div className="flex h-16 items-center gap-3 border-b px-5 lg:h-20">
        <div className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"><Braces className="size-5" /></div>
        <div><p className="font-semibold tracking-tight">API Explorer</p><p className="text-xs text-sidebar-foreground/60">Generated dashboard</p></div>
      </div>
      <div className="p-4 lg:p-5">
        <div className="mb-5 hidden rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-4 lg:block">
          <div className="mb-2 flex items-center justify-between"><Badge variant="outline">Provider</Badge><span className="flex items-center gap-1.5 text-xs text-emerald-600"><span className="size-1.5 rounded-full bg-emerald-500" />Connected</span></div>
          <p className="font-medium">${apiName}</p>
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-sidebar-foreground/60">${description}</p>
        </div>
        <p className="mb-2 hidden px-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/45 lg:block">Resources</p>
        <nav className="flex gap-2 overflow-x-auto lg:grid">
          {resources.map((resource) => <button className={selected.name === resource.name ? "flex min-w-fit items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-2.5 text-left text-sm font-medium text-sidebar-accent-foreground" : "flex min-w-fit items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"} key={resource.name} onClick={() => setSelected(resource)}>
            <Database className="size-4" /><span className="flex-1">{resource.pluralLabel}</span><ChevronRight className="hidden size-4 opacity-40 lg:block" />
          </button>)}
        </nav>
      </div>
      <a className="absolute bottom-5 left-5 hidden items-center gap-2 text-xs text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground lg:flex" href="https://github.com/raminos/api-explorer" rel="noreferrer" target="_blank"><Code2 className="size-4" />Generated by API Explorer</a>
    </aside>
    <ResourcePage key={selected.name} resource={selected} />
  </div>;
}
`;

export const stylesTemplate = `@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --primary: oklch(0.47 0.18 264);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.47 0.18 264);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.95 0.02 264);
  --sidebar-accent-foreground: oklch(0.25 0.08 264);
  --sidebar-border: oklch(0.922 0 0);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground antialiased; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }
}
`;

export const uiFiles: ReadonlyArray<GeneratedFile> = [
  {
    path: "web/src/lib/utils.ts",
    contents: `import { clsx, type ClassValue } from "clsx";\nimport { twMerge } from "tailwind-merge";\n\nexport const cn = (...inputs: ReadonlyArray<ClassValue>) => twMerge(clsx(inputs));\n`,
  },
  {
    path: "web/src/components/ui/button.tsx",
    contents: `import * as React from "react";\nimport { Slot } from "@radix-ui/react-slot";\nimport { cva, type VariantProps } from "class-variance-authority";\nimport { cn } from "../../lib/utils.ts";\n\nconst buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]", { variants: { variant: { default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90", destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90", outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground", secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80", ghost: "hover:bg-accent hover:text-accent-foreground", link: "text-primary underline-offset-4 hover:underline" }, size: { default: "h-9 px-4 py-2", sm: "h-8 rounded-md gap-1.5 px-3", lg: "h-10 rounded-md px-6", icon: "size-9" } }, defaultVariants: { variant: "default", size: "default" } });\n\nfunction Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { readonly asChild?: boolean }) { const Comp = asChild ? Slot : "button"; return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />; }\n\nexport { Button, buttonVariants };\n`,
  },
  {
    path: "web/src/components/ui/card.tsx",
    contents: `import * as React from "react";\nimport { cn } from "../../lib/utils.ts";\n\nconst Card = ({ className, ...props }: React.ComponentProps<"div">) => <div data-slot="card" className={cn("bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm", className)} {...props} />;\nconst CardHeader = ({ className, ...props }: React.ComponentProps<"div">) => <div data-slot="card-header" className={cn("grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6", className)} {...props} />;\nconst CardTitle = ({ className, ...props }: React.ComponentProps<"div">) => <div data-slot="card-title" className={cn("leading-none font-semibold", className)} {...props} />;\nconst CardDescription = ({ className, ...props }: React.ComponentProps<"div">) => <div data-slot="card-description" className={cn("text-muted-foreground text-sm", className)} {...props} />;\nconst CardContent = ({ className, ...props }: React.ComponentProps<"div">) => <div data-slot="card-content" className={cn("px-6", className)} {...props} />;\nconst CardFooter = ({ className, ...props }: React.ComponentProps<"div">) => <div data-slot="card-footer" className={cn("flex items-center px-6", className)} {...props} />;\n\nexport { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };\n`,
  },
  {
    path: "web/src/components/ui/input.tsx",
    contents: `import * as React from "react";\nimport { cn } from "../../lib/utils.ts";\n\nfunction Input({ className, type, ...props }: React.ComponentProps<"input">) { return <input type={type} data-slot="input" className={cn("file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]", className)} {...props} />; }\nexport { Input };\n`,
  },
  {
    path: "web/src/components/ui/textarea.tsx",
    contents: `import * as React from "react";\nimport { cn } from "../../lib/utils.ts";\n\nfunction Textarea({ className, ...props }: React.ComponentProps<"textarea">) { return <textarea data-slot="textarea" className={cn("border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", className)} {...props} />; }\nexport { Textarea };\n`,
  },
  {
    path: "web/src/components/ui/label.tsx",
    contents: `import * as React from "react";\nimport * as LabelPrimitive from "@radix-ui/react-label";\nimport { cn } from "../../lib/utils.ts";\n\nfunction Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) { return <LabelPrimitive.Root data-slot="label" className={cn("flex items-center gap-2 text-sm leading-none font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50", className)} {...props} />; }\nexport { Label };\n`,
  },
  {
    path: "web/src/components/ui/badge.tsx",
    contents: `import * as React from "react";\nimport { Slot } from "@radix-ui/react-slot";\nimport { cva, type VariantProps } from "class-variance-authority";\nimport { cn } from "../../lib/utils.ts";\n\nconst badgeVariants = cva("inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 gap-1 overflow-hidden", { variants: { variant: { default: "border-transparent bg-primary text-primary-foreground", secondary: "border-transparent bg-secondary text-secondary-foreground", destructive: "border-transparent bg-destructive text-white", outline: "text-foreground" } }, defaultVariants: { variant: "default" } });\nfunction Badge({ className, variant, asChild = false, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { readonly asChild?: boolean }) { const Comp = asChild ? Slot : "span"; return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />; }\nexport { Badge, badgeVariants };\n`,
  },
  {
    path: "web/src/components/ui/table.tsx",
    contents: `import * as React from "react";\nimport { cn } from "../../lib/utils.ts";\n\nconst Table = ({ className, ...props }: React.ComponentProps<"table">) => <table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />;\nconst TableHeader = ({ className, ...props }: React.ComponentProps<"thead">) => <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;\nconst TableBody = ({ className, ...props }: React.ComponentProps<"tbody">) => <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;\nconst TableRow = ({ className, ...props }: React.ComponentProps<"tr">) => <tr data-slot="table-row" className={cn("hover:bg-muted/50 border-b transition-colors", className)} {...props} />;\nconst TableHead = ({ className, ...props }: React.ComponentProps<"th">) => <th data-slot="table-head" className={cn("text-muted-foreground h-11 px-4 text-left align-middle text-xs font-medium whitespace-nowrap", className)} {...props} />;\nconst TableCell = ({ className, ...props }: React.ComponentProps<"td">) => <td data-slot="table-cell" className={cn("px-4 py-3 align-middle whitespace-nowrap", className)} {...props} />;\nexport { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };\n`,
  },
  {
    path: "web/src/components/ui/alert.tsx",
    contents: `import * as React from "react";\nimport { cva, type VariantProps } from "class-variance-authority";\nimport { cn } from "../../lib/utils.ts";\n\nconst alertVariants = cva("relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5", { variants: { variant: { default: "bg-card text-card-foreground", destructive: "text-destructive bg-card [&>svg]:text-current" } }, defaultVariants: { variant: "default" } });\nfunction Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) { return <div role="alert" data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />; }\nconst AlertTitle = ({ className, ...props }: React.ComponentProps<"div">) => <div data-slot="alert-title" className={cn("col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight", className)} {...props} />;\nconst AlertDescription = ({ className, ...props }: React.ComponentProps<"div">) => <div data-slot="alert-description" className={cn("text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm", className)} {...props} />;\nexport { Alert, AlertTitle, AlertDescription };\n`,
  },
  {
    path: "web/src/components/ui/skeleton.tsx",
    contents: `import { cn } from "../../lib/utils.ts";\nfunction Skeleton({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="skeleton" className={cn("bg-accent animate-pulse rounded-md", className)} {...props} />; }\nexport { Skeleton };\n`,
  },
];
