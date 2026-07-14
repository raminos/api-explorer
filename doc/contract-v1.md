# Contract 1.0 reference

A contract has `schemaVersion: "1.0"`, one `api` definition, and at least one resource. See `examples/jsonplaceholder/api-explorer.json` for a complete document.

## API

`api.baseUrl` must use HTTPS. Authentication is one of:

- `none`
- `apiKey`, with `location`, request `name`, and `environmentVariable`
- `bearer`, with `environmentVariable`

The JSON contains only the environment-variable name, never the secret.

## Resources and operations

Resource and field identifiers use lower camel case. A resource declares labels, its ID field, fields, optional relationships, and any supported operations. Operations use an HTTP method and an absolute path relative to the API base URL. Use `{id}` in item paths.

List and search operations declare `none`, `offset`, `cursor`, or `page` pagination. Cursor pagination additionally identifies the items and next-cursor paths in the upstream response.

Relationships are `belongsTo` or `hasMany` and name both local and foreign join fields. Compilation fails if a resource or field is missing.

## Semantic fields

Every field declares `required` and may declare `readOnly`, `nullable`, and a description.

| Type | Generated editor | Notable validation |
| --- | --- | --- |
| `string` | text or textarea | length, regex, multiline hint |
| `markdown` | Markdown editor | length |
| `html` | rich-text editor | length |
| `csv` | table editor | length |
| `url`, `email` | specialized input | semantic format |
| `date`, `time`, `datetime` | temporal input | semantic format |
| `integer`, `number` | numeric input | minimum, maximum |
| `boolean` | checkbox | boolean |
| `enum` | select | closed value set |
| `reference` | resource select | target resource exists; string/integer `valueType` |

The current dashboard implements lightweight native controls for these editor choices. The IR deliberately preserves richer intent so a ShadCN adapter can replace individual controls without changing contracts.

Unknown JSON keys are errors. This prevents a misspelled constraint from silently weakening validation or changing generated behavior.

Optional JSON properties describe the wire format only. Effect Schema decodes each omitted property into `Option.none`; present values become `Option.some`. The compiler and IR never represent domain absence with `undefined`, so downstream adapters must handle absence explicitly.
