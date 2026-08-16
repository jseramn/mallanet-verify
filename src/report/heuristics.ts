import type { CheckStatus, OptionalCheckStatus, ReportChecks } from "./types.js";
import type { SourceResult } from "../croma/client.js";

export function overallStatus(checks: ReportChecks): CheckStatus {
  const values = Object.values(checks).filter((s) => s !== "N/A");
  if (values.includes("Fail")) return "Fail";
  if (values.includes("Alert")) return "Alert";
  return "Pass";
}

export function mapRecordCheck(
  result: SourceResult<{ has_records: boolean }>,
): CheckStatus {
  if (result.status !== "ok") return "Alert";
  return result.data.has_records ? "Fail" : "Pass";
}

/** Rama name hits are Alert and must never auto-Fail. */
export function mapRamaCheck(
  result: SourceResult<{ cases: unknown[] }>,
): CheckStatus {
  if (result.status !== "ok") return "Alert";
  return result.data.cases.length > 0 ? "Alert" : "Pass";
}

export function mapRuesCheck(
  result: SourceResult<{ found?: boolean; name?: string }>,
  employer?: string,
): OptionalCheckStatus {
  if (result.status === "skipped") return "N/A";
  if (result.status !== "ok") return "Alert";
  if (!result.data.found) return "Alert";
  if (employer && result.data.name) {
    const have = result.data.name.toLowerCase();
    if (!have.includes(employer.toLowerCase())) return "Alert";
  }
  return "Pass";
}
