import {
  CROMA_BASE,
  POLICIA,
  POLICIA_WAIT_S,
  PROCURADURIA,
  RAMA,
  RUES_NAME,
  RUES_NIT,
} from "./endpoints.js";

export type SourceResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; reason: string }
  | { status: "skipped" };

export type RecordPayload = { has_records: boolean };
export type RamaPayload = { cases: unknown[] };
export type RuesPayload = { found?: boolean; name?: string };
export type CromaBundle = {
  policia: SourceResult<RecordPayload>;
  procuraduria: SourceResult<RecordPayload>;
  rama: SourceResult<RamaPayload>;
  rues: SourceResult<RuesPayload>;
};
export type CromaQueryInput = {
  document_number?: string;
  document_type?: string;
  name?: string;
  nit?: string;
  employer?: string;
};
export type CromaGateway = { query(input: CromaQueryInput): Promise<CromaBundle> };
export type CromaClientOpts = {
  apiKey: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  maxPollMs?: number;
};

type Job = { data?: unknown; job?: { id?: string; status?: string; status_url?: string }; error?: { message?: string } };

function asCases(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const rec = data as Record<string, unknown>;
  for (const key of ["cases", "results", "processes", "procesos", "items"]) {
    if (Array.isArray(rec[key])) return rec[key] as unknown[];
  }
  return [];
}

function asRues(data: unknown): RuesPayload {
  if (!data || typeof data !== "object") return { found: false };
  const rec = data as Record<string, unknown>;
  const entity = rec.entity as { name?: string } | undefined;
  if (typeof rec.found === "boolean") return { found: rec.found, name: entity?.name };
  const first = Array.isArray(rec.entities) ? (rec.entities[0] as { name?: string } | undefined) : undefined;
  return first ? { found: true, name: first.name } : { found: false };
}

export function createCromaClient(opts: CromaClientOpts): CromaGateway {
  const http = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const maxPollMs = opts.maxPollMs ?? POLICIA_WAIT_S * 1000;
  const auth = { Authorization: `Bearer ${opts.apiKey}` };

  async function poll(statusUrl: string): Promise<unknown> {
    const deadline = now() + maxPollMs;
    while (now() < deadline) {
      await sleep(Math.min(1000, maxPollMs));
      const body = (await (await http(statusUrl, { headers: auth })).json()) as Job;
      if (body.job?.status === "completed") return body.data;
      if (["failed", "canceled", "expired"].includes(body.job?.status ?? "")) {
        throw new Error(body.error?.message ?? body.job?.status);
      }
    }
    throw new Error("202_exhausted");
  }

  async function post(path: string, body: unknown): Promise<unknown> {
    const res = await http(`${CROMA_BASE}${path}`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json", Prefer: `wait=${POLICIA_WAIT_S}` },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => ({}))) as Job;
    if (res.status === 200) return payload.data;
    if (res.status === 202) {
      const url = payload.job?.status_url ?? (payload.job?.id ? `${CROMA_BASE}/jobs/${payload.job.id}` : undefined);
      if (!url) throw new Error("202_exhausted");
      return poll(url);
    }
    throw new Error(res.status >= 500 ? "upstream_error" : `http_${res.status}`);
  }

  async function wrap<T>(fn: () => Promise<T>): Promise<SourceResult<T>> {
    try {
      return { status: "ok", data: await fn() };
    } catch (err) {
      return { status: "error", reason: err instanceof Error ? err.message : "error" };
    }
  }

  return {
    async query(input) {
      const type = input.document_type ?? "CC";
      const record = (path: string) =>
        input.document_number
          ? wrap(async () => ({
              has_records: Boolean(
                ((await post(path, { document_number: input.document_number, document_type: type })) as RecordPayload)
                  ?.has_records,
              ),
            }))
          : Promise.resolve({ status: "error" as const, reason: "missing_document" });
      const [policia, procuraduria, rama, rues] = await Promise.all([
        record(POLICIA),
        record(PROCURADURIA),
        input.name
          ? wrap(async () => ({ cases: asCases(await post(RAMA, { name: input.name, entity_type: "natural" })) }))
          : Promise.resolve({ status: "error" as const, reason: "missing_name" }),
        input.nit
          ? wrap(async () => asRues(await post(RUES_NIT, { document_number: input.nit })))
          : input.employer
            ? wrap(async () => asRues(await post(RUES_NAME, { name: input.employer })))
            : Promise.resolve({ status: "skipped" as const }),
      ]);
      return { policia, procuraduria, rama, rues };
    },
  };
}
