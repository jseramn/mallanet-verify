import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeLinkedInUrl } from "./normalize.js";

describe("normalizeLinkedInUrl", () => {
  it("strips query params and does not fetch", () => {
    const src = readFileSync(resolve(process.cwd(), "src/linkedin/normalize.ts"), "utf8");
    expect(src).not.toMatch(/\bfetch\b/);
    expect(
      normalizeLinkedInUrl("https://www.LinkedIn.com/in/jose-ramon/?trk=x#top"),
    ).toBe("https://www.linkedin.com/in/jose-ramon");
  });
});
