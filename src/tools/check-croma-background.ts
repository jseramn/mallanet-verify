import { z } from "zod";
import { mapCromaChecks } from "../croma/map.js";
import type { ServerContext } from "../context.js";
import { jsonResult } from "./result.js";

export const checkCromaBackgroundSchema = z.object({
  document_number: z.string().optional(),
  name: z.string().optional(),
  document_type: z.string().optional(),
  nit: z.string().optional(),
  employer: z.string().optional(),
});

export async function checkCromaBackground(
  ctx: ServerContext,
  input: z.infer<typeof checkCromaBackgroundSchema>,
) {
  const bundle = await ctx.croma.query(input);
  const mapped = mapCromaChecks(bundle, "Alert", input.employer);
  return jsonResult({ bundle, ...mapped });
}
