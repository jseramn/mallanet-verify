/**
 * Thin Croma REST client.
 * Docs: https://docs.usecroma.com
 * Graceful when CROMA_API_KEY is missing.
 */

export interface CromaClientOptions {
  apiKey?: string | null;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export type CromaAvailability =
  | { available: true; apiKeyPresent: true }
  | { available: false; apiKeyPresent: false; reason: string };

export interface CromaCallResult<T = unknown> {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  data?: T;
  error?: string;
}

export class CromaClient {
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CromaClientOptions = {}) {
    this.apiKey =
      options.apiKey === undefined
        ? process.env.CROMA_API_KEY?.trim() || null
        : options.apiKey?.trim() || null;
    this.baseUrl = (
      options.baseUrl ||
      process.env.CROMA_BASE_URL ||
      "https://api.croma.run"
    ).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  availability(): CromaAvailability {
    if (!this.apiKey) {
      return {
        available: false,
        apiKeyPresent: false,
        reason:
          "CROMA_API_KEY is not set. Croma-backed checks are skipped. Get a key at https://platform.usecroma.com",
      };
    }
    return { available: true, apiKeyPresent: true };
  }

  private skipped<T>(): CromaCallResult<T> {
    const avail = this.availability();
    return {
      ok: false,
      skipped: true,
      error: avail.available ? "unavailable" : avail.reason,
    };
  }

  async post<T = unknown>(
    path: string,
    body: Record<string, unknown>,
    init?: { preferWaitSeconds?: number },
  ): Promise<CromaCallResult<T>> {
    if (!this.apiKey) return this.skipped<T>();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (init?.preferWaitSeconds) {
      headers.Prefer = `wait=${init.preferWaitSeconds}`;
    }

    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const json = (await res.json().catch(() => null)) as
        | { data?: T; error?: { message?: string }; job?: unknown }
        | null;

      if (res.status === 202) {
        return {
          ok: false,
          status: 202,
          data: json as T | undefined,
          error:
            "Croma returned an async job (202). Retry with Prefer: wait or poll the job status_url.",
        };
      }

      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error:
            json?.error?.message ||
            `Croma request failed with HTTP ${res.status}`,
        };
      }

      return { ok: true, status: res.status, data: json?.data ?? (json as T) };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Policía Nacional antecedentes. */
  checkCriminalRecords(documentNumber: string, documentType = "CC") {
    return this.post(
      "/co/policia/criminal-records/v1",
      { document_number: documentNumber, document_type: documentType },
      { preferWaitSeconds: 45 },
    );
  }

  /** Procuraduría SIRI antecedentes. */
  checkProcuraduria(documentNumber: string, documentType = "CC") {
    return this.post("/co/procuraduria/disciplinary-records/v1", {
      document_number: documentNumber,
      document_type: documentType,
    });
  }

  /** Rama Judicial cases by person name. */
  checkJudicial(fullName: string) {
    return this.post("/co/rama-judicial/cases-by-entity/v1", {
      name: fullName,
      entity_type: "natural",
      page: 1,
    });
  }

  /** RUES entity search by name / company. */
  checkRues(name: string) {
    return this.post("/co/rues/entities-by-name/v1", {
      name,
      page: 1,
    });
  }
}

export async function runCromaBackgroundCheck(
  client: CromaClient,
  input: {
    full_name: string;
    document_number: string;
    document_type?: string;
    company_name?: string | null;
  },
) {
  const avail = client.availability();
  if (!avail.available) {
    return {
      skipped: true as const,
      reason: avail.reason,
      judicial: null,
      criminal_records: null,
      procuraduria: null,
      rues: null,
    };
  }

  const documentType = input.document_type ?? "CC";
  const [judicial, criminal_records, procuraduria, rues] = await Promise.all([
    client.checkJudicial(input.full_name),
    client.checkCriminalRecords(input.document_number, documentType),
    client.checkProcuraduria(input.document_number, documentType),
    client.checkRues(input.company_name || input.full_name),
  ]);

  return {
    skipped: false as const,
    reason: null,
    judicial,
    criminal_records,
    procuraduria,
    rues,
  };
}
