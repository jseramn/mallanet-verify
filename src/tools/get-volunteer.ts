import { z } from "zod";
import type { ServerContext } from "../context.js";
import { jsonResult } from "./result.js";

export const getVolunteerSchema = z.object({ volunteer_id: z.string() });

export async function getVolunteer(
  ctx: ServerContext,
  input: z.infer<typeof getVolunteerSchema>,
) {
  const row = await ctx.store.getVolunteerById(input.volunteer_id);
  if (!row) throw new Error("volunteer not found");
  return jsonResult(row);
}
