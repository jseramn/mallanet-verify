export type CheckStatus = "Pass" | "Alert" | "Fail";
export type OptionalCheckStatus = CheckStatus | "N/A";

export type ReportChecks = {
  judicial: CheckStatus;
  criminal_records: CheckStatus;
  procuraduria: CheckStatus;
  rues: OptionalCheckStatus;
  linkedin_consistency: CheckStatus;
};

export type LinkedInSummary = {
  headline: string;
  experience: unknown[];
  education: unknown[];
};

export type VerificationReport = {
  volunteer_id: string;
  name: string;
  overall_status: CheckStatus;
  checks: ReportChecks;
  findings: string[];
  linkedin_summary: LinkedInSummary;
  timestamp: string;
};
