/** Shared domain types for Mallanet Verify. */

export type VolunteerStatus =
  | "pending"
  | "data_requested"
  | "in_review"
  | "verified"
  | "failed";

export type CheckResult = "Pass" | "Alert" | "Fail" | "Skipped";

export type OverallResult = "Pass" | "Alert" | "Fail";

export interface Volunteer {
  id: string;
  full_name: string;
  document_type: "CC" | "CE" | "PA";
  document_number: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  company_name: string | null;
  city: string | null;
  status: VolunteerStatus;
  notes: string | null;
  verification_data: Record<string, unknown> | null;
  last_report: VerificationReport | null;
  created_at: string;
  updated_at: string;
}

export interface CheckDetail {
  result: CheckResult;
  summary: string;
  evidence?: unknown;
}

export interface VerificationReport {
  volunteer_id: string;
  document_number: string;
  full_name: string;
  overall: OverallResult;
  generated_at: string;
  checks: {
    judicial: CheckDetail;
    criminal_records: CheckDetail;
    procuraduria: CheckDetail;
    rues: CheckDetail;
    linkedin_consistency: CheckDetail;
  };
  notes: string[];
}

export const DEMO_CEDULA = "1127938850";

export function createDemoVolunteer(now = new Date().toISOString()): Volunteer {
  return {
    id: "vol_demo_1127938850",
    full_name: "JOSE RAMON DEMO",
    document_type: "CC",
    document_number: DEMO_CEDULA,
    email: "demo@mallanet.org",
    phone: null,
    linkedin_url: "https://www.linkedin.com/in/jose-ramon-demo",
    company_name: "Mallanet",
    city: "Medellín",
    status: "pending",
    notes: "Seeded demo volunteer for local / judge evaluation.",
    verification_data: null,
    last_report: null,
    created_at: now,
    updated_at: now,
  };
}
