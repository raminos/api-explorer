# Contract 1.0 reference

A contract has `schemaVersion: "1.0"`, one `api` definition, and at least one resource. The [Open Brewery DB contract](../examples/open-brewery-db/api-explorer.json) runs against a live public provider; the [showcase contract](../examples/showcase/api-explorer.json) exercises every field and pagination variant.

## API

`api.baseUrl` must use HTTPS. Authentication is one of:

- `none`
- `apiKey`, with `location`, request `name`, and `environmentVariable`
- `bearer`, with `environmentVariable`

The JSON contains only the environment-variable name, never the secret.

`api.headers` is an ordered list applied to every upstream request. A header uses either `source: "literal"` with a checked-in value, or `source: "environment"` with a variable read through redacted Effect configuration. Header names must be unique without regard to case.

## Resources and operations

Resource and field identifiers use lower camel case or snake case so the contract can represent both common JSON naming conventions without a lossy rename layer. A resource declares labels, its ID field, fields, optional relationships, and any supported operations. Operations use an HTTP method and an absolute path relative to the API base URL. Use `{id}` in item paths.

List and search operations declare one pagination strategy. Every strategy identifies `response.itemsPath`; `$` means the response root and paths such as `$.data.items` address wrapped collections.

| Strategy | Request contract | Response contract | Generated control |
| --- | --- | --- | --- |
| `none` | none | items path | no pagination |
| `offset` | offset/limit names and default limit | items path plus `shortPage` or total-items path | previous/next |
| `cursor` | cursor/limit names and default limit | items path and nullable next-cursor path | load more |
| `page` | page/size names, first page, default size | items path plus `shortPage` or total-pages path | previous/next |

Termination behavior is explicit. Offset and page adapters never infer a final page unless `end.type` is `shortPage`; providers with metadata can instead declare the appropriate total path.

Relationships are `belongsTo` or `hasMany` and name both local and foreign join fields. Compilation fails if a resource or field is missing.

## Semantic fields

Every field declares `required` and may declare `readOnly`, `writeOnly`, `nullable`, and a description. `required` controls property omission. `nullable` is the supported value union: a present property may contain its declared type or `null`. Arbitrary polymorphic unions are intentionally not accepted in 1.0.

| Type | Generated editor | Notable validation |
| --- | --- | --- |
| `string` | text or textarea | length, regex, multiline hint |
| `markdown` | Markdown editor | length |
| `html` | rich-text editor | length |
| `csv` | table editor | length |
| `code` | code area | length, regex, optional language |
| `url`, `email`, `phone`, `uuid` | specialized input | semantic format |
| `password` | masked password input | length, regex; commonly `writeOnly` |
| `image` | URL input and image preview | HTTP(S) URL |
| `date`, `time`, `datetime` | temporal input | semantic format |
| `integer`, `number` | numeric input | minimum, maximum |
| `boolean` | checkbox | boolean |
| `enum` | select | closed value set |
| `reference` | resource select | target resource exists; string/integer `valueType` |
| `array` of enum | multi-select | closed values, item count, uniqueness |
| `array` of reference | resource multi-select | target resource and value type |
| `array` of scalar | repeatable inputs | closed item kind, item count, uniqueness |

Array items are a closed union of string, integer, number, boolean, URL, email, phone, UUID, enum, or reference. Untyped arrays are rejected instead of becoming `unknown[]`.

Contract 1.0 deliberately rejects arbitrary nested objects and scalar unions other than `null`. Model stable related objects as resources; recursive object schemas and typed file uploads require new exhaustive adapter support before they enter the public contract.

The generated dashboard contains real source-owned shadcn/ui primitives, a valid `components.json`, Tailwind theme tokens, Lucide icons, responsive tables, create/update dialogs, semantic forms, loading/empty/error states, previous/next controls, and cursor load-more navigation. Markdown, HTML, code, and CSV remain safely displayed as text until dedicated sanitized editors are introduced.

The same generated Effect schemas validate mutation inputs, upstream server responses, and collection items fetched by the browser. Missing response paths, excess resource properties, invalid formatted strings, invalid enum members, and invalid array items fail before reaching UI components.

Unknown JSON keys are errors. This prevents a misspelled constraint from silently weakening validation or changing generated behavior.

Optional JSON properties describe the wire format only. Effect Schema decodes each omitted property into `Option.none`; present values become `Option.some`. The compiler and IR never represent domain absence with `undefined`, so downstream adapters must handle absence explicitly.
