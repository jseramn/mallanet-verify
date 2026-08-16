import { z } from "zod";
import type { ServerContext } from "../context.js";
import { persistReport } from "./generate-report.js";
import { jsonResult } from "./result.js";

export const verifyVolunteerSchema = z.object({ volunteer_id: z.string() });

export async function verifyVolunteer(
  ctx: ServerContext,
  input: z.infer<typeof verifyVolunteerSchema>,
) {
  const volunteer = await ctx.store.getVolunteerById(input.volunteer_id);
  if (!volunteer) throw new Error("volunteer not found");
  if (!volunteer.document_number) throw new Error("identity unbound");
  await ctx.store.insertVerificationRequest({
    id: ctx.newId(),
    volunteer_id: volunteer.id,
    document_type: volunteer.document_type,
    created_at: ctx.now(),
    status: "open",
  });
  ctx.log(`verify_volunteer start volunteer_id=${volunteer.id}`);
  return jsonResult(await persistReport(ctx, volunteer));
}
