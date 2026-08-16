import { describe, expect, it, vi } from "vitest";
import { InMemoryVolunteerStore } from "../src/lib/store.js";
import { createDemoVolunteer, DEMO_CEDULA } from "../src/lib/types.js";
import { CromaClient, runCromaBackgroundCheck } from "../src/lib/croma.js";
import { validateLinkedIn } from "../src/lib/linkedin.js";
import {
  generateReport,
  scoreCriminalRecords,
  scoreJudicial,
  scoreLinkedIn,
  scoreProcuraduria,
  scoreRues,
} from "../src/lib/report.js";

describe("demo seed", () => {
  it("seeds cédula 1127938850 as pending", async () => {
    const store = new InMemoryVolunteerStore();
    const pending = await store.listPending();
    expect(pending.some((v) => v.document_number === DEMO_CEDULA)).toBe(true);
    const byDoc = await store.getByDocument(DEMO_CEDULA);
    expect(byDoc?.full_name).toContain("JOSE");
    expect(byDoc?.status).toBe("pending");
  });
});

describe("validate_linkedin (no scraping)", () => {
  it("passes when slug matches name tokens", () => {
    const result = validateLinkedIn({
      full_name: "JOSE RAMON DEMO",
      linkedin_url: "https://www.linkedin.com/in/jose-ramon-demo",
    });
    expect(result.valid_url).toBe(true);
    expect(result.consistent).toBe(true);
    expect(result.result).toBe("Pass");
    expect(result.matched_tokens.length).toBeGreaterThan(0);
  });

  it("alerts when slug does not match name", () => {
    const result = validateLinkedIn({
      full_name: "JOSE RAMON DEMO",
      linkedin_url: "https://www.linkedin.com/in/unrelated-profile-xyz",
    });
    expect(result.valid_url).toBe(true);
    expect(result.consistent).toBe(false);
    expect(result.result).toBe("Alert");
  });

  it("fails on non-profile URLs", () => {
    const result = validateLinkedIn({
      full_name: "JOSE RAMON DEMO",
      linkedin_url: "https://www.linkedin.com/company/mallanet",
    });
    expect(result.valid_url).toBe(false);
    expect(result.result).toBe("Fail");
  });
});

describe("report scoring", () => {
  it("fails on criminal records", () => {
    const detail = scoreCriminalRecords({
      ok: true,
      data: { has_records: true, status: "TIENE ASUNTOS PENDIENTES" },
    });
    expect(detail.result).toBe("Fail");
  });

  it("passes clean criminal records", () => {
    const detail = scoreCriminalRecords({
      ok: true,
      data: {
        has_records: false,
        status: "NO TIENE ASUNTOS PENDIENTES CON LAS AUTORIDADES JUDICIALES",
      },
    });
    expect(detail.result).toBe("Pass");
  });

  it("alerts when judicial cases exist", () => {
    const detail = scoreJudicial({
      ok: true,
      data: { cases: [{ id: 1 }, { id: 2 }], pagination: { total: 2 } },
    });
    expect(detail.result).toBe("Alert");
  });

  it("fails procuraduria when has_records", () => {
    expect(
      scoreProcuraduria({
        ok: true,
        data: { found: true, has_records: true, status: "antecedentes" },
      }).result,
    ).toBe("Fail");
  });

  it("alerts RUES miss when company declared", () => {
    expect(
      scoreRues({ ok: true, data: { entities: [] } }, "Mallanet").result,
    ).toBe("Alert");
  });

  it("builds Pass/Alert/Fail report with all five checks", () => {
    const volunteer = createDemoVolunteer();
    const report = generateReport(volunteer, {
      skipped: false,
      judicial: { ok: true, data: { cases: [] } },
      criminal_records: {
        ok: true,
        data: { has_records: false, status: "clean" },
      },
      procuraduria: {
        ok: true,
        data: { found: true, has_records: false, status: "clean" },
      },
      rues: {
        ok: true,
        data: { entities: [{ name: "Mallanet", nit: "900000000" }] },
      },
    });

    expect(report.checks.judicial.result).toBe("Pass");
    expect(report.checks.criminal_records.result).toBe("Pass");
    expect(report.checks.procuraduria.result).toBe("Pass");
    expect(report.checks.rues.result).toBe("Pass");
    expect(report.checks.linkedin_consistency.result).toBe("Pass");
    expect(report.overall).toBe("Pass");
    expect(scoreLinkedIn(volunteer).result).toBe("Pass");
  });

  it("skips Croma sections when key missing", () => {
    const report = generateReport(createDemoVolunteer(), {
      skipped: true,
      reason: "CROMA_API_KEY is not set",
    });
    expect(report.checks.criminal_records.result).toBe("Skipped");
    expect(report.checks.judicial.result).toBe("Skipped");
    expect(report.checks.procuraduria.result).toBe("Skipped");
    expect(report.checks.rues.result).toBe("Skipped");
    expect(report.checks.linkedin_consistency.result).toBe("Pass");
    expect(report.notes.join(" ")).toMatch(/CROMA_API_KEY/);
  });
});

describe("Croma client graceful degrade", () => {
  it("skips when API key absent", async () => {
    const client = new CromaClient({ apiKey: null });
    expect(client.availability().available).toBe(false);
    const result = await client.checkCriminalRecords(DEMO_CEDULA);
    expect(result.skipped).toBe(true);
  });

  it("calls Croma endpoints when key present", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: { has_records: false, status: "clean", cases: [], entities: [] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = new CromaClient({
      apiKey: "croma_test_fake",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const bg = await runCromaBackgroundCheck(client, {
      full_name: "JOSE RAMON DEMO",
      document_number: DEMO_CEDULA,
      company_name: "Mallanet",
    });

    expect(bg.skipped).toBe(false);
    expect(fetchImpl).toHaveBeenCalled();
    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/co/policia/criminal-records/v1"))).toBe(
      true,
    );
    expect(
      urls.some((u) => u.includes("/co/procuraduria/disciplinary-records/v1")),
    ).toBe(true);
    expect(
      urls.some((u) => u.includes("/co/rama-judicial/cases-by-entity/v1")),
    ).toBe(true);
    expect(urls.some((u) => u.includes("/co/rues/entities-by-name/v1"))).toBe(
      true,
    );
  });
});

describe("store updates", () => {
  it("request → verify status transitions via saveReport", async () => {
    const store = new InMemoryVolunteerStore();
    const volunteer = (await store.getByDocument(DEMO_CEDULA))!;
    await store.update(volunteer.id, { status: "data_requested" });
    const report = generateReport(volunteer, {
      skipped: false,
      judicial: { ok: true, data: { cases: [] } },
      criminal_records: { ok: true, data: { has_records: false } },
      procuraduria: { ok: true, data: { found: true, has_records: false } },
      rues: { ok: true, data: { entities: [{ name: "Mallanet" }] } },
    });
    const saved = await store.saveReport(volunteer.id, report);
    expect(saved.status).toBe("verified");
    expect(saved.last_report?.overall).toBe("Pass");
  });

  it("never references public.volunteers in Neon SQL helpers", async () => {
    // Guardrail: source of NeonVolunteerStore must only target verify.*
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(new URL("../src/lib/store.ts", import.meta.url), "utf8");
    expect(src).toMatch(/CREATE SCHEMA IF NOT EXISTS verify/);
    expect(src).toMatch(/verify\.volunteers/);
    expect(src).not.toMatch(/ALTER\s+TABLE\s+public\.volunteers/i);
    expect(src).not.toMatch(/FROM\s+public\.volunteers/i);
    expect(src).not.toMatch(/INTO\s+public\.volunteers/i);
  });
});
