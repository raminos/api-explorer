# Explorer JSON protocol 1.0

Backend and frontend adapters are independently selectable only when they implement the same explorer protocol version. The schema-backed descriptor lives in `src/generator/protocol.ts`; generated code may use any language or framework.

Protocol 1.0 defines:

| Concern | Contract |
| --- | --- |
| Media type | `application/json` |
| Collection route | `/{resource}` |
| Item route | `/{resource}/{id}` |
| List/get | `GET` |
| Create | `POST` |
| Update | `PATCH` or `PUT` |
| Delete | `DELETE` |
| Query parameters | forwarded to the upstream operation |
| Successful response | validated, then preserved as upstream JSON |
| Error response | JSON object with string `error` field |

Pagination parameters and response extraction paths come from the versioned API contract. The protocol does not prescribe React, Effect, Pydantic, Go structs, routing libraries, or project layout.

Every adapter declares supported protocol versions in its exhaustive capabilities. When generating both targets, the registry rejects a backend/frontend pair without a shared protocol. A protocol change requires a new version rather than a silent behavior change.
