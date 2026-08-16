import { z } from "zod";
import type { ServerContext } from "../context.js";
import { jsonResult } from "./result.js";

export const listPendingVolunteersSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  status_filter: z.string().optional(),
});

export async function listPendingVolunteers(
  ctx: ServerContext,
  input: z.infer<typeof listPendingVolunteersSchema>,
) {
  const rows = await ctx.store.listPendingVolunteers(
    input.limit ?? 20,
    input.status_filter,
  );
  return jsonResult(rows);
}
