import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requireEnv } from "./index.js";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe("boot env", () => {
  it("aborts without DATABASE_URL", () => {
    expect(() => requireEnv({ CROMA_API_KEY: "k" })).toThrow(/DATABASE_URL/);
  });

  it("aborts without CROMA_API_KEY", () => {
    expect(() => requireEnv({ DATABASE_URL: "postgres://x" })).toThrow(/CROMA_API_KEY/);
  });

  it("tools never spawn subprocesses", () => {
    const files = walk(join(process.cwd(), "src")).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/child_process/);
      expect(src).not.toMatch(/\bspawn\s*\(/);
      expect(src).not.toMatch(/\bexec(?:File)?\s*\(/);
    }
  });
});
