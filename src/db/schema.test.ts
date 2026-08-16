import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "sql/001_verify_schema.sql"),
  "utf8",
);

describe("verify schema isolation", () => {
  it("creates schema verify and never touches public objects", () => {
    expect(sql).toMatch(/CREATE SCHEMA IF NOT EXISTS verify/i);
    expect(sql).not.toMatch(/ALTER\s+(TABLE\s+)?public\./i);
    expect(sql).not.toMatch(/DROP\s+(TABLE|SCHEMA|INDEX)\s+public\b/i);
    expect(sql).not.toMatch(/\bpublic\.volunteers\b/i);
  });

  it("omits intake PII columns from verify.volunteers", () => {
    expect(sql).not.toMatch(/\bcontact\b/i);
    expect(sql).not.toMatch(/\bip_hash\b/i);
  });

  it("defines slim volunteers plus identity and report tables", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS verify\.volunteers/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS verify\.verification_requests/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS verify\.verification_reports/i);
    expect(sql).toMatch(/document_type text NOT NULL DEFAULT 'CC'/);
    expect(sql).toMatch(/document_number text/);
    expect(sql).toMatch(/linkedin_url text/);
    expect(sql).toMatch(/digital_skills jsonb/);
    expect(sql).toMatch(/crisis_experience boolean/);
  });
});
