import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryVolunteerStore } from "../src/lib/store.js";
import { CromaClient } from "../src/lib/croma.js";
import { registerTools, TOOL_NAMES } from "../src/tools/register.js";
import { DEMO_CEDULA } from "../src/lib/types.js";

async function connectedPair() {
  const server = new McpServer({ name: "mallanet-verify", version: "1.0.0" });
  registerTools(
    server,
    new InMemoryVolunteerStore(),
    new CromaClient({ apiKey: null }),
  );

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return { client, server };
}

describe("MCP tool surface", () => {
  it("exposes all seven Mallanet Verify tools", async () => {
    const { client } = await connectedPair();
    const listed = await client.listTools();
    const names = listed.tools.map((t) => t.name).sort();
    expect(names).toEqual([...TOOL_NAMES].sort());
  });

  it("lists the seeded demo volunteer and verifies without Croma key", async () => {
    const { client } = await connectedPair();

    const pending = await client.callTool({
      name: "list_pending_volunteers",
      arguments: {},
    });
    const pendingText = String(
      (pending.content as Array<{ text?: string }>)[0]?.text ?? "",
    );
    expect(pendingText).toContain(DEMO_CEDULA);

    const verified = await client.callTool({
      name: "verify_volunteer",
      arguments: { document_number: DEMO_CEDULA },
    });
    const verifiedPayload = JSON.parse(
      String((verified.content as Array<{ text?: string }>)[0]?.text ?? "{}"),
    );
    expect(verifiedPayload.report.checks).toHaveProperty("judicial");
    expect(verifiedPayload.report.checks).toHaveProperty("criminal_records");
    expect(verifiedPayload.report.checks).toHaveProperty("procuraduria");
    expect(verifiedPayload.report.checks).toHaveProperty("rues");
    expect(verifiedPayload.report.checks).toHaveProperty(
      "linkedin_consistency",
    );
    expect(verifiedPayload.report.checks.criminal_records.result).toBe(
      "Skipped",
    );
    expect(["Pass", "Alert", "Fail"]).toContain(verifiedPayload.report.overall);
  });
});
