import type { Volunteer, VerificationReport, VolunteerStatus } from "./types.js";
import { createDemoVolunteer, DEMO_CEDULA } from "./types.js";

export interface VolunteerStore {
  readonly backend: "memory" | "neon";
  listPending(): Promise<Volunteer[]>;
  getById(id: string): Promise<Volunteer | null>;
  getByDocument(documentNumber: string): Promise<Volunteer | null>;
  update(id: string, patch: Partial<Volunteer>): Promise<Volunteer>;
  saveReport(id: string, report: VerificationReport): Promise<Volunteer>;
  close(): Promise<void>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryVolunteerStore implements VolunteerStore {
  readonly backend = "memory" as const;
  private volunteers = new Map<string, Volunteer>();

  constructor(seed: Volunteer[] = [createDemoVolunteer()]) {
    for (const v of seed) {
      this.volunteers.set(v.id, clone(v));
    }
  }

  async listPending(): Promise<Volunteer[]> {
    return [...this.volunteers.values()]
      .filter((v) => v.status === "pending" || v.status === "data_requested")
      .map(clone);
  }

  async getById(id: string): Promise<Volunteer | null> {
    const v = this.volunteers.get(id);
    return v ? clone(v) : null;
  }

  async getByDocument(documentNumber: string): Promise<Volunteer | null> {
    const normalized = documentNumber.replace(/\D/g, "");
    for (const v of this.volunteers.values()) {
      if (v.document_number.replace(/\D/g, "") === normalized) {
        return clone(v);
      }
    }
    return null;
  }

  async update(id: string, patch: Partial<Volunteer>): Promise<Volunteer> {
    const current = this.volunteers.get(id);
    if (!current) {
      throw new Error(`Volunteer not found: ${id}`);
    }
    const next: Volunteer = {
      ...current,
      ...patch,
      id: current.id,
      updated_at: new Date().toISOString(),
    };
    this.volunteers.set(id, next);
    return clone(next);
  }

  async saveReport(id: string, report: VerificationReport): Promise<Volunteer> {
    const status: VolunteerStatus =
      report.overall === "Fail" ? "failed" : "verified";
    return this.update(id, { last_report: report, status });
  }

  async close(): Promise<void> {
    // no-op
  }
}

/** Neon / Postgres store. Uses schema `verify` only — never touches public.volunteers. */
export class NeonVolunteerStore implements VolunteerStore {
  readonly backend = "neon" as const;
  private pool: import("pg").Pool;

  private constructor(pool: import("pg").Pool) {
    this.pool = pool;
  }

  static async connect(databaseUrl: string): Promise<NeonVolunteerStore> {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
    const store = new NeonVolunteerStore(pool);
    await store.ensureSchema();
    await store.seedDemoIfNeeded();
    return store;
  }

  /**
   * Creates `verify` schema objects only.
   * Explicitly does NOT ALTER or touch `public.volunteers`.
   */
  private async ensureSchema(): Promise<void> {
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS verify`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS verify.volunteers (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        document_type TEXT NOT NULL DEFAULT 'CC',
        document_number TEXT NOT NULL UNIQUE,
        email TEXT,
        phone TEXT,
        linkedin_url TEXT,
        company_name TEXT,
        city TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        verification_data JSONB,
        last_report JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  private async seedDemoIfNeeded(): Promise<void> {
    const existing = await this.pool.query(
      `SELECT id FROM verify.volunteers WHERE document_number = $1 LIMIT 1`,
      [DEMO_CEDULA],
    );
    if (existing.rowCount && existing.rowCount > 0) return;

    const demo = createDemoVolunteer();
    await this.pool.query(
      `INSERT INTO verify.volunteers (
        id, full_name, document_type, document_number, email, phone,
        linkedin_url, company_name, city, status, notes, verification_data,
        last_report, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
      ) ON CONFLICT (document_number) DO NOTHING`,
      [
        demo.id,
        demo.full_name,
        demo.document_type,
        demo.document_number,
        demo.email,
        demo.phone,
        demo.linkedin_url,
        demo.company_name,
        demo.city,
        demo.status,
        demo.notes,
        demo.verification_data,
        demo.last_report,
        demo.created_at,
        demo.updated_at,
      ],
    );
  }

  private mapRow(row: Record<string, unknown>): Volunteer {
    return {
      id: String(row.id),
      full_name: String(row.full_name),
      document_type: row.document_type as Volunteer["document_type"],
      document_number: String(row.document_number),
      email: (row.email as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      linkedin_url: (row.linkedin_url as string | null) ?? null,
      company_name: (row.company_name as string | null) ?? null,
      city: (row.city as string | null) ?? null,
      status: row.status as VolunteerStatus,
      notes: (row.notes as string | null) ?? null,
      verification_data:
        (row.verification_data as Record<string, unknown> | null) ?? null,
      last_report: (row.last_report as VerificationReport | null) ?? null,
      created_at: new Date(String(row.created_at)).toISOString(),
      updated_at: new Date(String(row.updated_at)).toISOString(),
    };
  }

  async listPending(): Promise<Volunteer[]> {
    const res = await this.pool.query(
      `SELECT * FROM verify.volunteers
       WHERE status IN ('pending', 'data_requested')
       ORDER BY created_at ASC`,
    );
    return res.rows.map((r) => this.mapRow(r));
  }

  async getById(id: string): Promise<Volunteer | null> {
    const res = await this.pool.query(
      `SELECT * FROM verify.volunteers WHERE id = $1 LIMIT 1`,
      [id],
    );
    return res.rows[0] ? this.mapRow(res.rows[0]) : null;
  }

  async getByDocument(documentNumber: string): Promise<Volunteer | null> {
    const normalized = documentNumber.replace(/\D/g, "");
    const res = await this.pool.query(
      `SELECT * FROM verify.volunteers WHERE regexp_replace(document_number, '\\D', '', 'g') = $1 LIMIT 1`,
      [normalized],
    );
    return res.rows[0] ? this.mapRow(res.rows[0]) : null;
  }

  async update(id: string, patch: Partial<Volunteer>): Promise<Volunteer> {
    const current = await this.getById(id);
    if (!current) throw new Error(`Volunteer not found: ${id}`);
    const next: Volunteer = {
      ...current,
      ...patch,
      id: current.id,
      updated_at: new Date().toISOString(),
    };
    await this.pool.query(
      `UPDATE verify.volunteers SET
        full_name = $2,
        document_type = $3,
        document_number = $4,
        email = $5,
        phone = $6,
        linkedin_url = $7,
        company_name = $8,
        city = $9,
        status = $10,
        notes = $11,
        verification_data = $12,
        last_report = $13,
        updated_at = $14
      WHERE id = $1`,
      [
        next.id,
        next.full_name,
        next.document_type,
        next.document_number,
        next.email,
        next.phone,
        next.linkedin_url,
        next.company_name,
        next.city,
        next.status,
        next.notes,
        next.verification_data ? JSON.stringify(next.verification_data) : null,
        next.last_report ? JSON.stringify(next.last_report) : null,
        next.updated_at,
      ],
    );
    return next;
  }

  async saveReport(id: string, report: VerificationReport): Promise<Volunteer> {
    const status: VolunteerStatus =
      report.overall === "Fail" ? "failed" : "verified";
    return this.update(id, { last_report: report, status });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export async function createStore(
  databaseUrl = process.env.DATABASE_URL,
): Promise<VolunteerStore> {
  if (!databaseUrl) {
    return new InMemoryVolunteerStore();
  }
  try {
    return await NeonVolunteerStore.connect(databaseUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[mallanet-verify] DATABASE_URL set but Neon connect failed (${message}). Falling back to in-memory store.`,
    );
    return new InMemoryVolunteerStore();
  }
}
