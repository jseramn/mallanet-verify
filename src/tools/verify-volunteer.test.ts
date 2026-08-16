import { describe, expect, it } from "vitest";
import type { ServerContext } from "../context.js";
import { createMemoryStore, OPERATOR } from "../db/memory.js";
import type { CromaBundle } from "../croma/client.js";
import type { VerificationReport } from "../report/types.js";
import { verifyVolunteer } from "./verify-volunteer.js";

const parse = <T>(r: { content: { text?: string }[] }) => JSON.parse(r.content[0]?.text ?? "") as T;

const clean: CromaBundle = {
  policia: { status: "ok", data: { has_records: false } },
  procuraduria: { status: "ok", data: { has_records: false } },
  rama: { status: "ok", data: { cases: [] } },
  rues: { status: "skipped" },
};

describe("verify_volunteer", () => {
  it("orchestrates Croma + LinkedIn normalize and persists overall+per-check", async () => {
    const store = createMemoryStore([
      { ...OPERATOR, linkedin_url: "https://www.linkedin.com/in/jose/?trk=x" },
    ]);
    const logs: string[] = [];
    const ctx: ServerContext = {
      store,
      croma: { query: async () => clean },
      log: (m) => logs.push(m),
      now: () => 1_700_000_000_000,
      newId: () => "id-1",
    };
    const report = parse<VerificationReport>(
      await verifyVolunteer(ctx, { volunteer_id: OPERATOR.id }),
    );
    expect(report.overall_status).toBe("Alert");
    expect(report.checks).toMatchObject({
      judicial: "Pass",
      criminal_records: "Pass",
      procuraduria: "Pass",
      rues: "N/A",
      linkedin_consistency: "Alert",
    });
    expect(store.reports).toHaveLength(1);
    expect(store.requests).toHaveLength(1);
    expect((await store.getVolunteerById(OPERATOR.id))?.linkedin_url).toBe(
      "https://www.linkedin.com/in/jose",
    );
    expect(logs.join("\n")).not.toContain(OPERATOR.document_number);
  });
});
