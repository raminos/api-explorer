import { Schema } from "effect";

export const ExplorerProtocolVersionSchema = Schema.Literal("1.0");
export type ExplorerProtocolVersion = typeof ExplorerProtocolVersionSchema.Type;

export const ExplorerProtocolSchema = Schema.Struct({
  version: ExplorerProtocolVersionSchema,
  mediaType: Schema.Literal("application/json"),
  collectionPath: Schema.Literal("/{resource}"),
  itemPath: Schema.Literal("/{resource}/{id}"),
  listMethod: Schema.Literal("GET"),
  getMethod: Schema.Literal("GET"),
  createMethod: Schema.Literal("POST"),
  updateMethods: Schema.Tuple(Schema.Literal("PATCH"), Schema.Literal("PUT")),
  deleteMethod: Schema.Literal("DELETE"),
  queryBehavior: Schema.Literal("forward"),
  responseBehavior: Schema.Literal("preserve-upstream-json"),
  errorBody: Schema.Struct({
    type: Schema.Literal("object"),
    messageField: Schema.Literal("error"),
    messageType: Schema.Literal("string"),
  }),
});
export type ExplorerProtocol = typeof ExplorerProtocolSchema.Type;

export const explorerProtocolV1: ExplorerProtocol = Schema.decodeUnknownSync(
  ExplorerProtocolSchema,
)({
  version: "1.0",
  mediaType: "application/json",
  collectionPath: "/{resource}",
  itemPath: "/{resource}/{id}",
  listMethod: "GET",
  getMethod: "GET",
  createMethod: "POST",
  updateMethods: ["PATCH", "PUT"],
  deleteMethod: "DELETE",
  queryBehavior: "forward",
  responseBehavior: "preserve-upstream-json",
  errorBody: { type: "object", messageField: "error", messageType: "string" },
});
