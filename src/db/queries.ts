import type postgres from "postgres";
import type {
  VerificationReportRow,
  VerificationRequestRow,
  VolunteerRow,
} from "./types.js";

export type Sql = postgres.Sql;

/** Parameterized verify-only access. Never log document_number. */
export async function getVolunteerById(
  sql: Sql,
  id: string,
): Promise<VolunteerRow | null> {
  const rows = await sql<VolunteerRow[]>`
    SELECT id, name, offer, zone, status, field_city, field_role,
           digital_skills, crisis_experience, source, code, created_at,
           document_type, document_number, linkedin_url
    FROM verify.volunteers
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function listVolunteers(
  sql: Sql,
  limit: number,
): Promise<VolunteerRow[]> {
  return sql<VolunteerRow[]>`
    SELECT id, name, offer, zone, status, field_city, field_role,
           digital_skills, crisis_experience, source, code, created_at,
           document_type, document_number, linkedin_url
    FROM verify.volunteers
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function countVolunteers(sql: Sql): Promise<number> {
  const rows = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM verify.volunteers
  `;
  return Number(rows[0]?.n ?? 0);
}

export type IdentityFields = {
  document_type?: string;
  document_number?: string | null;
  linkedin_url?: string | null;
};

export type VerifyStore = {
  getVolunteerById(id: string): Promise<VolunteerRow | null>;
  bindVolunteerIdentity(id: string, fields: IdentityFields): Promise<VolunteerRow | null>;
  listPendingVolunteers(limit: number, status?: string): Promise<VolunteerRow[]>;
  insertVerificationRequest(row: VerificationRequestRow): Promise<VerificationRequestRow>;
  insertVerificationReport(row: VerificationReportRow): Promise<VerificationReportRow>;
};

export async function bindVolunteerIdentity(
  sql: Sql,
  id: string,
  fields: IdentityFields,
): Promise<VolunteerRow | null> {
  const rows = await sql<VolunteerRow[]>`
    UPDATE verify.volunteers
    SET
      document_type = COALESCE(${fields.document_type ?? null}, document_type),
      document_number = COALESCE(${fields.document_number ?? null}, document_number),
      linkedin_url = COALESCE(${fields.linkedin_url ?? null}, linkedin_url)
    WHERE id = ${id}
    RETURNING id, name, offer, zone, status, field_city, field_role,
              digital_skills, crisis_experience, source, code, created_at,
              document_type, document_number, linkedin_url
  `;
  return rows[0] ?? null;
}

export async function listPendingVolunteers(
  sql: Sql,
  limit: number,
  status?: string,
): Promise<VolunteerRow[]> {
  const statusFilter = status ?? null;
  return sql<VolunteerRow[]>`
    SELECT id, name, offer, zone, status, field_city, field_role,
           digital_skills, crisis_experience, source, code, created_at,
           document_type, document_number, linkedin_url
    FROM verify.volunteers v
    WHERE NOT EXISTS (
      SELECT 1 FROM verify.verification_reports r WHERE r.volunteer_id = v.id
    )
    AND (${statusFilter}::text IS NULL OR v.status = ${statusFilter})
    ORDER BY v.created_at DESC
    LIMIT ${limit}
  `;
}

export function createSqlStore(sql: Sql): VerifyStore {
  return {
    getVolunteerById: (id) => getVolunteerById(sql, id),
    bindVolunteerIdentity: (id, fields) => bindVolunteerIdentity(sql, id, fields),
    listPendingVolunteers: (limit, status) => listPendingVolunteers(sql, limit, status),
    insertVerificationRequest: (row) => insertVerificationRequest(sql, row),
    insertVerificationReport: (row) => insertVerificationReport(sql, row),
  };
}

export async function insertVerificationRequest(
  sql: Sql,
  row: VerificationRequestRow,
): Promise<VerificationRequestRow> {
  const rows = await sql<VerificationRequestRow[]>`
    INSERT INTO verify.verification_requests
      (id, volunteer_id, document_type, created_at, status)
    VALUES
      (${row.id}, ${row.volunteer_id}, ${row.document_type}, ${row.created_at}, ${row.status})
    RETURNING id, volunteer_id, document_type, created_at, status
  `;
  return rows[0];
}

export async function insertVerificationReport(
  sql: Sql,
  row: VerificationReportRow,
): Promise<VerificationReportRow> {
  const rows = await sql<VerificationReportRow[]>`
    INSERT INTO verify.verification_reports
      (id, volunteer_id, overall_status, checks, findings, created_at)
    VALUES
      (${row.id}, ${row.volunteer_id}, ${row.overall_status},
       ${sql.json(row.checks as postgres.JSONValue)},
       ${sql.json(row.findings as postgres.JSONValue)},
       ${row.created_at})
    RETURNING id, volunteer_id, overall_status, checks, findings, created_at
  `;
  return rows[0];
}
