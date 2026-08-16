import { describe, expect, it } from "vitest";
import { createCromaClient } from "./client.js";
import { CROMA_BASE, POLICIA, PROCURADURIA, RAMA, RUES_NIT } from "./endpoints.js";
import { mapCromaChecks } from "./map.js";

const ok = (data: unknown) =>
  new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
const raw = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function client(handler: (url: string) => Response) {
  const calls: string[] = [];
  return {
    calls,
    croma: createCromaClient({
      apiKey: "k",
      maxPollMs: 2,
      sleep: async () => {},
      now: (() => {
        let t = 0;
        return () => ++t;
      })(),
      fetch: async (input) => {
        calls.push(String(input));
        return handler(String(input));
      },
    }),
  };
}

describe("croma client", () => {
  it("runs person checks without RUES when no NIT/employer", async () => {
    const { croma, calls } = client((url) => (url.endsWith(RAMA) ? ok({ cases: [] }) : ok({ has_records: false })));
    const bundle = await croma.query({ document_number: "1000000000", name: "Example Operator" });
    expect(bundle.rues.status).toBe("skipped");
    expect(calls.some((u) => u.includes("/rues/"))).toBe(false);
    expect(calls).toEqual(expect.arrayContaining([`${CROMA_BASE}${POLICIA}`, `${CROMA_BASE}${PROCURADURIA}`, `${CROMA_BASE}${RAMA}`]));
  });

  it("includes RUES when NIT is present", async () => {
    const { croma, calls } = client((url) => {
      if (url.endsWith(RUES_NIT)) return ok({ found: true, entity: { name: "Acme" } });
      return url.endsWith(RAMA) ? ok({ cases: [] }) : ok({ has_records: false });
    });
    const bundle = await croma.query({ document_number: "1", name: "A", nit: "900654922" });
    expect(bundle.rues).toEqual({ status: "ok", data: { found: true, name: "Acme" } });
    expect(calls).toContain(`${CROMA_BASE}${RUES_NIT}`);
  });

  it("handles Policía 202 then completed poll", async () => {
    const { croma } = client((url) => {
      if (url.endsWith(POLICIA)) return raw(202, { job: { id: "j1", status_url: `${CROMA_BASE}/jobs/j1` } });
      if (url.endsWith("/jobs/j1")) return raw(200, { job: { status: "completed" }, data: { has_records: false } });
      return url.endsWith(RAMA) ? ok({ cases: [] }) : ok({ has_records: false });
    });
    const bundle = await croma.query({ document_number: "1", name: "A" });
    expect(bundle.policia).toEqual({ status: "ok", data: { has_records: false } });
  });

  it("degrades Rama upstream error to Alert and continues other sources", async () => {
    const { croma } = client((url) => (url.endsWith(RAMA) ? raw(500, { error: { message: "boom" } }) : ok({ has_records: false })));
    const bundle = await croma.query({ document_number: "1", name: "A" });
    expect(bundle.rama.status).toBe("error");
    expect(bundle.policia).toEqual({ status: "ok", data: { has_records: false } });
    expect(bundle.procuraduria).toEqual({ status: "ok", data: { has_records: false } });
    expect(mapCromaChecks(bundle, "Alert").checks).toMatchObject({
      judicial: "Alert",
      criminal_records: "Pass",
      procuraduria: "Pass",
    });
  });
});
