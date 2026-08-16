import { z } from "zod";
import type { ServerContext } from "../context.js";
import type { VolunteerRow } from "../db/types.js";
import { mapCromaChecks } from "../croma/map.js";
import { normalizeLinkedInUrl } from "../linkedin/normalize.js";
import { overallStatus } from "../report/heuristics.js";
import type { VerificationReport } from "../report/types.js";
import { jsonResult } from "./result.js";

export const generateReportSchema = z.object({ volunteer_id: z.string() });

export async function persistReport(ctx: ServerContext, volunteer: VolunteerRow) {
  const bundle = await ctx.croma.query({
    document_number: volunteer.document_number ?? undefined,
    document_type: volunteer.document_type,
    name: volunteer.name,
  });
  let linkedinUrl = volunteer.linkedin_url;
  if (linkedinUrl) {
    linkedinUrl = normalizeLinkedInUrl(linkedinUrl);
    await ctx.store.bindVolunteerIdentity(volunteer.id, { linkedin_url: linkedinUrl });
  }
  const { checks, findings } = mapCromaChecks(bundle, "Alert");
  const report: VerificationReport = {
    volunteer_id: volunteer.id,
    name: volunteer.name,
    overall_status: overallStatus(checks),
    checks,
    findings,
    linkedin_summary: { headline: linkedinUrl ?? "", experience: [], education: [] },
    timestamp: new Date(ctx.now()).toISOString(),
  };
  await ctx.store.insertVerificationReport({
    id: ctx.newId(),
    volunteer_id: volunteer.id,
    overall_status: report.overall_status,
    checks: report.checks,
    findings: report.findings,
    created_at: ctx.now(),
  });
  return report;
}

export async function generateReport(ctx: ServerContext, input: z.infer<typeof generateReportSchema>) {
  const volunteer = await ctx.store.getVolunteerById(input.volunteer_id);
  if (!volunteer) throw new Error("volunteer not found");
  return jsonResult(await persistReport(ctx, volunteer));
}
