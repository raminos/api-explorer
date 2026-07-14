import { it } from "@effect/vitest";
import { Effect, Array as EffectArray, Option } from "effect";
import { expect } from "vitest";
import { parseContract } from "../../contract/parse.ts";
import { compileContract } from "../../ir/compile.ts";
import { Json } from "../../libraries/json.ts";
import { RegularExpression } from "../../libraries/regular-expression.ts";
import { backendAdapter } from "../backend/effect-bun/adapter.ts";
import { frontendAdapter } from "../frontend/tanstack-shadcn/adapter.ts";

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
        { name: "dueAt", label: "Due at", type: "datetime", required: false },
      ],
      operations: {
        list: {
          method: "GET",
          path: "/tasks",
          pagination: { type: "none", response: { itemsPath: "$" } },
        },
      },
    },
  ],
} as const;

it.effect("emits independently consumable backend and frontend layers", () =>
  Effect.gen(function* () {
    const ir = yield* parseContract(input).pipe(Effect.flatMap(compileContract));
    const backend = yield* backendAdapter.generate(ir);
    const frontend = yield* frontendAdapter.generate(ir);
    expect(backendAdapter.primitives.map(({ metadata }) => metadata.id)).toEqual([
      "project",
      "models",
      "operations",
      "transport",
    ]);
    expect(frontendAdapter.primitives.map(({ metadata }) => metadata.id)).toEqual([
      "project",
      "contracts",
      "client",
      "resource-components",
      "application",
    ]);
    expect(backend.map(({ path }) => path)).toContain("server/src/models.ts");
    expect(backend.map(({ path }) => path)).toContain("server/src/server.ts");
    expect(frontend.map(({ path }) => path)).toContain("web/src/components/ResourceForm.tsx");
    expect(frontend.map(({ path }) => path)).toContain("web/src/App.tsx");
    const typesFile = EffectArray.findFirst(backend, ({ path }) => path === "server/src/types.ts");
    expect(Option.map(typesFile, ({ contents }) => contents)).toEqual(
      Option.some(expect.stringContaining("interface Tasks")),
    );
    const resource = EffectArray.get(ir.resources, 0);
    const title = Option.flatMap(resource, ({ fields }) => EffectArray.get(fields, 1));
    expect(Option.map(title, backendAdapter.units.renderFieldSchema)).toEqual(
      Option.some(expect.stringContaining("Schema.maxLength(120)")),
    );
    const dueAt = Option.flatMap(resource, ({ fields }) => EffectArray.get(fields, 2));
    expect(Option.map(dueAt, backendAdapter.units.renderFieldSchema)).toEqual(
      Option.some('Schema.optionalWith(Schema.DateTimeUtc, { as: "Option" })'),
    );
    expect(frontendAdapter.units.renderCreateUpdateForm()).toContain("switch (field.editor)");
  }).pipe(Effect.provide(Json.Default), Effect.provide(RegularExpression.Default)),
);
