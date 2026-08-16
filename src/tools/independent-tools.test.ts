import { describe, expect, it } from "vitest";
import type { CromaBundle } from "../croma/client.js";
import type { ServerContext } from "../context.js";
import { createMemoryStore, OPERATOR } from "../db/memory.js";
import type { VolunteerRow } from "../db/types.js";
import type { VerificationReport } from "../report/types.js";
import { checkCromaBackground, checkCromaBackgroundSchema } from "./check-croma-background.js";
import { generateReport, generateReportSchema } from "./generate-report.js";
import { getVolunteer, getVolunteerSchema } from "./get-volunteer.js";
import { listPendingVolunteers, listPendingVolunteersSchema } from "./list-pending-volunteers.js";
import { requestVerificationData, requestVerificationDataSchema } from "./request-verification-data.js";
import { validateLinkedIn, validateLinkedInSchema } from "./validate-linkedin.js";
import { verifyVolunteer, verifyVolunteerSchema } from "./verify-volunteer.js";

const parse = <T>(r: { content: { text?: string }[] }) => JSON.parse(r.content[0]?.text ?? "") as T;

const clean: CromaBundle = {
  policia: { status: "ok", data: { has_records: false } },
  procuraduria: { status: "ok", data: { has_records: false } },
  rama: { status: "ok", data: { cases: [] } },
  rues: { status: "skipped" },
};

const ruesMismatch: CromaBundle = {
  ...clean,
  rues: { status: "ok", data: { found: true, name: "Other SAS" } },
};

function ctx(bundle: CromaBundle = clean, seed?: VolunteerRow[]) {
  const store = createMemoryStore(seed);
  const logs: string[] = [];
  const context: ServerContext = {
    store,
    croma: { query: async () => bundle },
    log: (m) => logs.push(m),
    now: () => 1,
    newId: () => "id-1",
  };
  return { context, store, logs };
}

describe("tool Zod schemas", () => {
  it("accepts valid inputs and rejects invalid ones", () => {
    expect(listPendingVolunteersSchema.safeParse({}).success).toBe(true);
    expect(listPendingVolunteersSchema.safeParse({ limit: 20 }).success).toBe(true);
    expect(listPendingVolunteersSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(listPendingVolunteersSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(getVolunteerSchema.safeParse({ volunteer_id: "v1" }).success).toBe(true);
    expect(getVolunteerSchema.safeParse({}).success).toBe(false);
    expect(
      requestVerificationDataSchema.safeParse({
        volunteer_id: "v1",
        document_number: "<document-number>",
      }).success,
    ).toBe(true);
    expect(requestVerificationDataSchema.safeParse({ volunteer_id: "v1" }).success).toBe(false);
    expect(checkCromaBackgroundSchema.safeParse({ name: "A", nit: "900000000" }).success).toBe(true);
    expect(checkCromaBackgroundSchema.safeParse({ document_number: 1 }).success).toBe(false);
    expect(validateLinkedInSchema.safeParse({ linkedin_url: "https://linkedin.com/in/x" }).success).toBe(true);
    expect(validateLinkedInSchema.safeParse({}).success).toBe(false);
    expect(generateReportSchema.safeParse({ volunteer_id: "v1" }).success).toBe(true);
    expect(generateReportSchema.safeParse({}).success).toBe(false);
    expect(verifyVolunteerSchema.safeParse({ volunteer_id: "v1" }).success).toBe(true);
    expect(verifyVolunteerSchema.safeParse({ volunteer_id: 1 }).success).toBe(false);
  });
});

describe("independently callable tools", () => {
  it("lists pending, gets by id, binds, and reports without verify_volunteer", async () => {
    const unbound = { ...OPERATOR, document_number: null };
    const { context, store, logs } = ctx(clean, [unbound]);
    const pending = parse<VolunteerRow[]>(await listPendingVolunteers(context, { limit: 10 }));
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(OPERATOR.id);
    const got = parse<VolunteerRow>(await getVolunteer(context, { volunteer_id: OPERATOR.id }));
    expect(got.name).toBe(OPERATOR.name);
    await requestVerificationData(context, {
      volunteer_id: OPERATOR.id,
      document_number: "<document-number>",
    });
    expect((await store.getVolunteerById(OPERATOR.id))?.document_number).toBe("<document-number>");
    const linkedin = parse<{ linkedin_url: string; fetched: boolean }>(
      await validateLinkedIn(context, {
        volunteer_id: OPERATOR.id,
        linkedin_url: "https://www.linkedin.com/in/example?trk=x",
      }),
    );
    expect(linkedin.linkedin_url).toBe("https://www.linkedin.com/in/example");
    expect(linkedin.fetched).toBe(false);
    const report = parse<VerificationReport>(
      await generateReport(context, { volunteer_id: OPERATOR.id }),
    );
    expect(report.overall_status).toBe("Alert");
    expect(report.checks.rues).toBe("N/A");
    expect(store.reports).toHaveLength(1);
    expect(parse<VolunteerRow[]>(await listPendingVolunteers(context, {}))).toHaveLength(0);
    expect(logs.join("\n")).not.toMatch(/document_number/);
  });

  it("check_croma_background runs without a volunteer row", async () => {
    const { context, store } = ctx();
    const out = parse<{ checks: { rues: string } }>(
      await checkCromaBackground(context, { name: "Example", document_type: "CC" }),
    );
    expect(out.checks.rues).toBe("N/A");
    expect(store.reports).toHaveLength(0);
  });

  it("maps RUES name/org mismatch to Alert", async () => {
    const { context } = ctx(ruesMismatch);
    const out = parse<{ checks: { rues: string }; findings: string[] }>(
      await checkCromaBackground(context, {
        name: "Example",
        nit: "900000000",
        employer: "Expected Org",
      }),
    );
    expect(out.checks.rues).toBe("Alert");
    expect(out.findings.some((f) => /RUES/i.test(f))).toBe(true);
  });

  it("verify_volunteer stays independently callable", async () => {
    const { context, store } = ctx();
    const report = parse<VerificationReport>(
      await verifyVolunteer(context, { volunteer_id: OPERATOR.id }),
    );
    expect(report.checks.criminal_records).toBe("Pass");
    expect(store.reports).toHaveLength(1);
  });
});
