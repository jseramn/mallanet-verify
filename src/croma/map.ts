import type { CromaBundle } from "./client.js";
import type { CheckStatus, ReportChecks } from "../report/types.js";
import { mapRamaCheck, mapRecordCheck, mapRuesCheck } from "../report/heuristics.js";

export function mapCromaChecks(bundle: CromaBundle, linkedin: CheckStatus, employer?: string) {
  const checks: ReportChecks = {
    judicial: mapRamaCheck(bundle.rama),
    criminal_records: mapRecordCheck(bundle.policia),
    procuraduria: mapRecordCheck(bundle.procuraduria),
    rues: mapRuesCheck(bundle.rues, employer),
    linkedin_consistency: linkedin,
  };
  const findings = [
    checks.criminal_records === "Fail" ? "Policía has_records" : "",
    checks.procuraduria === "Fail" ? "Procuraduría has_records" : "",
    checks.judicial === "Alert" && bundle.rama.status === "ok" ? "Rama Judicial name match" : "",
    bundle.rama.status === "error" ? "Rama Judicial degraded" : "",
    bundle.policia.status === "error" ? "Policía degraded" : "",
    bundle.procuraduria.status === "error" ? "Procuraduría degraded" : "",
    checks.rues === "Alert" ? "RUES mismatch or degraded" : "",
    linkedin === "Alert" ? "LinkedIn consistency pending consent" : "",
  ].filter(Boolean);
  return { checks, findings };
}
