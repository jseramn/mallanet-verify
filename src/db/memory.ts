import type { IdentityFields, VerifyStore } from "./queries.js";
import type { VerificationReportRow, VerificationRequestRow, VolunteerRow } from "./types.js";

export const OPERATOR: VolunteerRow = {
  id: "verify-operator-001",
  name: "Example Operator",
  offer: "verification-operator",
  zone: "internal",
  status: "pending",
  field_city: null,
  field_role: null,
  digital_skills: null,
  crisis_experience: null,
  source: "seed",
  code: "VERIFY-OP-001",
  created_at: 1755382800000,
  document_type: "CC",
  document_number: "1000000000",
  linkedin_url: null,
};

export function createMemoryStore(seed: VolunteerRow[] = [OPERATOR]) {
  const volunteers = new Map(seed.map((v) => [v.id, { ...v }]));
  const reports: VerificationReportRow[] = [];
  const requests: VerificationRequestRow[] = [];
  const store: VerifyStore & { reports: VerificationReportRow[]; requests: VerificationRequestRow[] } = {
    reports,
    requests,
    getVolunteerById: async (id) => (volunteers.get(id) ? { ...volunteers.get(id)! } : null),
    bindVolunteerIdentity: async (id, fields: IdentityFields) => {
      const v = volunteers.get(id);
      if (!v) return null;
      Object.assign(v, Object.fromEntries(Object.entries(fields).filter(([, val]) => val !== undefined)));
      return { ...v };
    },
    listPendingVolunteers: async (limit, status) =>
      [...volunteers.values()]
        .filter((v) => !reports.some((r) => r.volunteer_id === v.id) && (!status || v.status === status))
        .slice(0, limit)
        .map((v) => ({ ...v })),
    insertVerificationRequest: async (row) => (requests.push(row), row),
    insertVerificationReport: async (row) => (reports.push(row), row),
  };
  return store;
}
