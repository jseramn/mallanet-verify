import { describe, expect, it } from "vitest";
import { createMemoryStore, OPERATOR } from "../db/memory.js";
import type { ServerContext } from "../context.js";
import { requestVerificationData } from "./request-verification-data.js";
import type { VolunteerRow } from "../db/types.js";

const parse = <T>(r: { content: { text?: string }[] }) => JSON.parse(r.content[0]?.text ?? "") as T;

function ctx(store = createMemoryStore([{ ...OPERATOR, document_number: null }])) {
  const logs: string[] = [];
  const context: ServerContext = {
    store,
    croma: { query: async () => { throw new Error("unused"); } },
    log: (m) => logs.push(m),
    now: () => 1,
    newId: () => "req-1",
  };
  return { context, store, logs };
}

describe("request_verification_data", () => {
  it("binds CC 1000000000 and never logs document_number", async () => {
    const { context, store, logs } = ctx();
    const bound = parse<VolunteerRow>(
      await requestVerificationData(context, {
        volunteer_id: OPERATOR.id,
        document_number: "1000000000",
      }),
    );
    expect(bound.document_type).toBe("CC");
    expect(bound.document_number).toBe("1000000000");
    expect(store.requests).toHaveLength(1);
    expect(logs.join("\n")).not.toContain("1000000000");
    expect(logs.join("\n")).not.toMatch(/document_number/);
  });
});
