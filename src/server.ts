import { McpServer } from "@modelcontextprotocol/server";
import { createCromaClient } from "./croma/client.js";
import type { ServerContext } from "./context.js";
import { createClient } from "./db/client.js";
import { createSqlStore } from "./db/queries.js";
import { checkCromaBackground, checkCromaBackgroundSchema } from "./tools/check-croma-background.js";
import { generateReport, generateReportSchema } from "./tools/generate-report.js";
import { getVolunteer, getVolunteerSchema } from "./tools/get-volunteer.js";
import { listPendingVolunteers, listPendingVolunteersSchema } from "./tools/list-pending-volunteers.js";
import { requestVerificationData, requestVerificationDataSchema } from "./tools/request-verification-data.js";
import { validateLinkedIn, validateLinkedInSchema } from "./tools/validate-linkedin.js";
import { verifyVolunteer, verifyVolunteerSchema } from "./tools/verify-volunteer.js";

export type { ServerContext };

export function createRuntimeContext(env: { DATABASE_URL: string; CROMA_API_KEY: string }): ServerContext {
  return {
    store: createSqlStore(createClient(env.DATABASE_URL)),
    croma: createCromaClient({ apiKey: env.CROMA_API_KEY }),
    log: (message) => console.error(message),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  };
}

export function createVerifyServer(ctx: ServerContext) {
  const server = new McpServer({ name: "mallanet-verify", version: "0.1.0" });
  const tools = [
    ["list_pending_volunteers", "List verify volunteers with no report", listPendingVolunteersSchema, listPendingVolunteers],
    ["get_volunteer", "Get a verify volunteer by id", getVolunteerSchema, getVolunteer],
    ["request_verification_data", "Bind document and optional LinkedIn URL", requestVerificationDataSchema, requestVerificationData],
    ["check_croma_background", "Query Croma sources with per-source degrade", checkCromaBackgroundSchema, checkCromaBackground],
    ["validate_linkedin", "Normalize a LinkedIn URL; no profile fetch", validateLinkedInSchema, validateLinkedIn],
    ["generate_report", "Persist Pass/Alert/Fail report for a volunteer", generateReportSchema, generateReport],
    ["verify_volunteer", "Orchestrate Croma, LinkedIn normalize, and persist", verifyVolunteerSchema, verifyVolunteer],
  ] as const;
  for (const [name, description, inputSchema, handler] of tools) {
    server.registerTool(name, { description, inputSchema }, (input: object) =>
      (handler as (ctx: ServerContext, value: object) => ReturnType<typeof handler>)(ctx, input),
    );
  }
  return server;
}
