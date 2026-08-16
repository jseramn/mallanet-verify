export type VolunteerRow = {
  id: string;
  name: string;
  offer: string;
  zone: string;
  status: string;
  field_city: string | null;
  field_role: string | null;
  digital_skills: unknown;
  crisis_experience: boolean | null;
  source: string | null;
  code: string;
  created_at: string | number;
  document_type: string;
  document_number: string | null;
  linkedin_url: string | null;
};

export type VerificationRequestRow = {
  id: string;
  volunteer_id: string;
  document_type: string;
  created_at: string | number;
  status: string;
};

export type VerificationReportRow = {
  id: string;
  volunteer_id: string;
  overall_status: string;
  checks: unknown;
  findings: unknown;
  created_at: string | number;
};
