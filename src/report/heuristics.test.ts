import { describe, expect, it } from "vitest";
import type { ReportChecks } from "./types.js";
import { mapRamaCheck, mapRecordCheck, overallStatus } from "./heuristics.js";

const pass: ReportChecks = {
  judicial: "Pass",
  criminal_records: "Pass",
  procuraduria: "Pass",
  rues: "N/A",
  linkedin_consistency: "Pass",
};

describe("heuristics", () => {
  it("maps antecedentes has_records to Fail", () => {
    expect(mapRecordCheck({ status: "ok", data: { has_records: true } })).toBe("Fail");
    expect(mapRecordCheck({ status: "ok", data: { has_records: false } })).toBe("Pass");
  });

  it("maps Rama homonym hits to Alert never Fail", () => {
    expect(mapRamaCheck({ status: "ok", data: { cases: [{ id: 1 }] } })).toBe("Alert");
    expect(mapRamaCheck({ status: "ok", data: { cases: [{ id: 1 }] } })).not.toBe("Fail");
    expect(overallStatus({ ...pass, judicial: "Alert" })).toBe("Alert");
  });

  it("Fail dominates mixed checks", () => {
    expect(overallStatus({ ...pass, criminal_records: "Fail", judicial: "Alert" })).toBe("Fail");
  });

  it("Alert without Fail", () => {
    expect(overallStatus({ ...pass, linkedin_consistency: "Alert" })).toBe("Alert");
  });

  it("all applicable Pass", () => {
    expect(overallStatus(pass)).toBe("Pass");
  });
});
