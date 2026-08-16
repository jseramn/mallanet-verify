import { z } from "zod";
import { normalizeLinkedInUrl } from "../linkedin/normalize.js";
import type { ServerContext } from "../context.js";
import { jsonResult } from "./result.js";

export const requestVerificationDataSchema = z.object({
  volunteer_id: z.string(),
  document_type: z.string().optional(),
  document_number: z.string(),
  linkedin_url: z.string().optional(),
});

export async function requestVerificationData(
  ctx: ServerContext,
  input: z.infer<typeof requestVerificationDataSchema>,
) {
  const existing = await ctx.store.getVolunteerById(input.volunteer_id);
  if (!existing) throw new Error("volunteer not found");
  const linkedin_url = input.linkedin_url
    ? normalizeLinkedInUrl(input.linkedin_url)
    : undefined;
  const bound = await ctx.store.bindVolunteerIdentity(input.volunteer_id, {
    document_type: input.document_type ?? "CC",
    document_number: input.document_number,
    linkedin_url,
  });
  await ctx.store.insertVerificationRequest({
    id: ctx.newId(),
    volunteer_id: input.volunteer_id,
    document_type: input.document_type ?? "CC",
    created_at: ctx.now(),
    status: "open",
  });
  ctx.log(`bound identity volunteer_id=${input.volunteer_id} type=${input.document_type ?? "CC"}`);
  return jsonResult(bound);
}
