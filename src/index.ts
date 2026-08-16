#!/usr/bin/env node
/**
 * Mallanet Verify — MCP stdio server
 * Public volunteer integrity checks for Mallanet (NGO).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createStore } from "./lib/store.js";
import { CromaClient } from "./lib/croma.js";
import { registerTools } from "./tools/register.js";

async function main(): Promise<void> {
  const store = await createStore(process.env.DATABASE_URL);
  const croma = new CromaClient();

  const server = new McpServer({
    name: "mallanet-verify",
    version: "1.0.0",
  });

  registerTools(server, store, croma);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await store.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("[mallanet-verify] fatal:", err);
  process.exit(1);
});
