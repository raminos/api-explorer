import { it } from "@effect/vitest";
import { Effect } from "effect";
import { expect } from "vitest";
import { parseContract } from "../../contract/parse.ts";
import { compileContract } from "../../ir/compile.ts";
import { Json } from "../../libraries/json.ts";
import { RegularExpression } from "../../libraries/regular-expression.ts";
import { backendAdapter } from "../backend.ts";
import { frontendAdapter } from "../frontend.ts";

const input = {
  schemaVersion: "1.0",
  api: { name: "Tasks", baseUrl: "https://example.com", auth: { type: "none" } },
  resources: [
    {
      name: "tasks",
      singularLabel: "Task",
      pluralLabel: "Tasks",
      idField: "id",
      fields: [
        { name: "id", label: "ID", type: "integer", required: true, readOnly: true },
        { name: "title", label: "Title", type: "string", required: true, maxLength: 120 },
      ],
      operations: {
        list: { method: "GET", path: "/tasks", pagination: { type: "none" } },
      },
    },
  ],
} as const;

it.effect("emits independently consumable backend and frontend layers", () =>
  Effect.gen(function* () {
    const ir = yield* parseContract(input).pipe(Effect.flatMap(compileContract));
    const backend = yield* backendAdapter.generate(ir);
    const frontend = yield* frontendAdapter.generate(ir);
    expect(backend.map(({ path }) => path)).toContain("server/src/models.ts");
    expect(backend.map(({ path }) => path)).toContain("server/src/server.ts");
    expect(frontend.map(({ path }) => path)).toContain("web/src/components/ResourceForm.tsx");
    expect(frontend.map(({ path }) => path)).toContain("web/src/App.tsx");
    expect(backend.find(({ path }) => path === "server/src/types.ts")?.contents).toContain(
      "interface Tasks",
    );
  }).pipe(Effect.provide(Json.Default), Effect.provide(RegularExpression.Default)),
);
