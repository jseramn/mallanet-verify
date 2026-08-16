import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "sql/001_verify_schema.sql"),
  "utf8",
);

describe("operator seed", () => {
  it("seeds the operator fixture once", () => {
    expect(sql).toContain("Example Operator");
    expect(sql).toMatch(/document_type,\s*document_number/);
    expect(sql).toContain("'CC'");
    expect(sql).toContain("'1000000000'");
  });

  it("re-seed stays unique", () => {
    expect(sql).toMatch(
      /CONSTRAINT volunteers_document_number_unique UNIQUE \(document_number\)/,
    );
    expect(sql).toMatch(/ON CONFLICT \(document_number\) DO NOTHING/);
  });
});
