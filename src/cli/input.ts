import { Schema } from "effect";
import { GenerateProjectInputSchema } from "../application/generate-project.ts";

export const CliGenerateInputSchema = GenerateProjectInputSchema;

export const decodeCliGenerateInput = Schema.decodeUnknown(CliGenerateInputSchema, {
  errors: "all",
  onExcessProperty: "error",
});
