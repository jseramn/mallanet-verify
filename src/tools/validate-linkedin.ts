import { z } from "zod";
import { normalizeLinkedInUrl } from "../linkedin/normalize.js";
import type { ServerContext } from "../context.js";
import { jsonResult } from "./result.js";

export const validateLinkedInSchema = z.object({
  linkedin_url: z.string(),
  volunteer_id: z.string().optional(),
});

export async function validateLinkedIn(
  ctx: ServerContext,
  input: z.infer<typeof validateLinkedInSchema>,
) {
  const linkedin_url = normalizeLinkedInUrl(input.linkedin_url);
  if (input.volunteer_id) {
    await ctx.store.bindVolunteerIdentity(input.volunteer_id, { linkedin_url });
  }
  return jsonResult({
    linkedin_url,
    linkedin_consistency: "Alert",
    fetched: false,
  });
}
