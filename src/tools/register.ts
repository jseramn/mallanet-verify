import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VolunteerStore } from "../lib/store.js";
import {
  CromaClient,
  runCromaBackgroundCheck,
  type CromaCallResult,
} from "../lib/croma.js";
import { validateLinkedIn } from "../lib/linkedin.js";
import { generateReport } from "../lib/report.js";
import type { Volunteer } from "../lib/types.js";

function jsonText(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorText(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

async function resolveVolunteer(
  store: VolunteerStore,
  args: { volunteer_id?: string; document_number?: string },
): Promise<Volunteer | null> {
  if (args.volunteer_id) {
    return store.getById(args.volunteer_id);
  }
  if (args.document_number) {
    return store.getByDocument(args.document_number);
  }
  return null;
}

const volunteerId = z
  .string()
  .optional()
  .describe("Volunteer id (e.g. vol_demo_1127938850)");

const documentNumber = z
  .string()
  .optional()
  .describe("Colombian cédula / document number (sample: 1127938850)");

export const TOOL_NAMES = [
  "list_pending_volunteers",
  "get_volunteer",
  "request_verification_data",
  "verify_volunteer",
  "check_croma_background",
  "validate_linkedin",
  "generate_report",
] as const;

export function registerTools(
  server: McpServer,
  store: VolunteerStore,
  croma: CromaClient = new CromaClient(),
): void {
  server.registerTool(
    "list_pending_volunteers",
    {
      description:
        "List volunteers awaiting verification (status pending or data_requested).",
    },
    async () => {
      const volunteers = await store.listPending();
      return jsonText({
        backend: store.backend,
        count: volunteers.length,
        volunteers: volunteers.map((v) => ({
          id: v.id,
          full_name: v.full_name,
          document_type: v.document_type,
          document_number: v.document_number,
          status: v.status,
          email: v.email,
          linkedin_url: v.linkedin_url,
          company_name: v.company_name,
          city: v.city,
          updated_at: v.updated_at,
        })),
      });
    },
  );

  server.registerTool(
    "get_volunteer",
    {
      description: "Fetch a volunteer by id or document_number (cédula).",
      inputSchema: {
        volunteer_id: volunteerId,
        document_number: documentNumber,
      },
    },
    async (args) => {
      if (!args.volunteer_id && !args.document_number) {
        return errorText("Provide volunteer_id or document_number.");
      }
      const volunteer = await resolveVolunteer(store, args);
      if (!volunteer) return errorText("Volunteer not found.");
      return jsonText({ backend: store.backend, volunteer });
    },
  );

  server.registerTool(
    "request_verification_data",
    {
      description:
        "Mark a volunteer as data_requested and return the checklist of fields needed for verification.",
      inputSchema: {
        volunteer_id: volunteerId,
        document_number: documentNumber,
        message: z
          .string()
          .optional()
          .describe("Optional note appended to the volunteer record."),
      },
    },
    async (args) => {
      if (!args.volunteer_id && !args.document_number) {
        return errorText("Provide volunteer_id or document_number.");
      }
      const volunteer = await resolveVolunteer(store, args);
      if (!volunteer) return errorText("Volunteer not found.");

      const missing: string[] = [];
      if (!volunteer.email) missing.push("email");
      if (!volunteer.linkedin_url) missing.push("linkedin_url");
      if (!volunteer.phone) missing.push("phone");
      if (!volunteer.company_name) missing.push("company_name");
      if (!volunteer.city) missing.push("city");

      const checklist = [
        "Valid Colombian document_number (CC)",
        "Legal full_name matching the cédula",
        "Declared LinkedIn /in/ profile URL (validated without scraping)",
        "Contact email",
        "Optional: company_name for RUES cross-check",
        "Optional: phone and city",
      ];

      const updated = await store.update(volunteer.id, {
        status: "data_requested",
        notes: args.message
          ? [volunteer.notes, args.message].filter(Boolean).join("\n")
          : volunteer.notes,
      });

      return jsonText({
        backend: store.backend,
        volunteer: updated,
        missing_fields: missing,
        checklist,
        next_step:
          "Once data is complete, call verify_volunteer or check_croma_background + validate_linkedin + generate_report.",
      });
    },
  );

  server.registerTool(
    "check_croma_background",
    {
      description:
        "Run Croma background checks (judicial, criminal_records, procuraduria, rues). Gracefully skips if CROMA_API_KEY is missing.",
      inputSchema: {
        volunteer_id: volunteerId,
        document_number: documentNumber,
      },
    },
    async (args) => {
      if (!args.volunteer_id && !args.document_number) {
        return errorText("Provide volunteer_id or document_number.");
      }
      const volunteer = await resolveVolunteer(store, args);
      if (!volunteer) return errorText("Volunteer not found.");

      const background = await runCromaBackgroundCheck(croma, {
        full_name: volunteer.full_name,
        document_number: volunteer.document_number,
        document_type: volunteer.document_type,
        company_name: volunteer.company_name,
      });

      const updated = await store.update(volunteer.id, {
        status: "in_review",
        verification_data: {
          ...(volunteer.verification_data ?? {}),
          croma: background,
          croma_checked_at: new Date().toISOString(),
        },
      });

      return jsonText({
        backend: store.backend,
        croma_available: croma.availability(),
        volunteer_id: updated.id,
        background,
      });
    },
  );

  server.registerTool(
    "validate_linkedin",
    {
      description:
        "Validate declared LinkedIn URL format and name↔slug consistency. Does NOT scrape LinkedIn.",
      inputSchema: {
        volunteer_id: volunteerId,
        document_number: documentNumber,
        linkedin_url: z
          .string()
          .optional()
          .describe(
            "Override LinkedIn URL to validate (otherwise uses stored value).",
          ),
        full_name: z
          .string()
          .optional()
          .describe("Override full name for consistency check."),
      },
    },
    async (args) => {
      let fullName = args.full_name;
      let linkedinUrl = args.linkedin_url ?? null;
      let volunteerIdValue: string | null = null;

      if (args.volunteer_id || args.document_number) {
        const volunteer = await resolveVolunteer(store, args);
        if (!volunteer) return errorText("Volunteer not found.");
        volunteerIdValue = volunteer.id;
        fullName = fullName ?? volunteer.full_name;
        linkedinUrl = linkedinUrl ?? volunteer.linkedin_url;
      }

      if (!fullName) {
        return errorText(
          "Provide full_name, or volunteer_id / document_number to load it.",
        );
      }

      const validation = validateLinkedIn({
        full_name: fullName,
        linkedin_url: linkedinUrl,
      });

      if (volunteerIdValue) {
        const volunteer = await store.getById(volunteerIdValue);
        if (volunteer) {
          await store.update(volunteerIdValue, {
            linkedin_url: validation.normalized_url ?? volunteer.linkedin_url,
            verification_data: {
              ...(volunteer.verification_data ?? {}),
              linkedin: validation,
              linkedin_checked_at: new Date().toISOString(),
            },
          });
        }
      }

      return jsonText({
        scraping: false,
        note: "No LinkedIn scraping is performed — declared data only.",
        validation,
      });
    },
  );

  server.registerTool(
    "generate_report",
    {
      description:
        "Generate a Pass/Alert/Fail verification report with judicial, criminal_records, procuraduria, rues, and linkedin_consistency.",
      inputSchema: {
        volunteer_id: volunteerId,
        document_number: documentNumber,
        persist: z
          .boolean()
          .optional()
          .describe("Persist report on the volunteer (default true)."),
      },
    },
    async (args) => {
      if (!args.volunteer_id && !args.document_number) {
        return errorText("Provide volunteer_id or document_number.");
      }
      const volunteer = await resolveVolunteer(store, args);
      if (!volunteer) return errorText("Volunteer not found.");

      const storedCroma = asCromaBundle(volunteer.verification_data);
      const report = generateReport(volunteer, storedCroma);

      const persist = args.persist !== false;
      const saved = persist
        ? await store.saveReport(volunteer.id, report)
        : volunteer;

      return jsonText({
        backend: store.backend,
        persisted: persist,
        volunteer_status: persist ? saved.status : volunteer.status,
        report,
      });
    },
  );

  server.registerTool(
    "verify_volunteer",
    {
      description:
        "End-to-end verification: Croma background + LinkedIn consistency + Pass/Alert/Fail report.",
      inputSchema: {
        volunteer_id: volunteerId,
        document_number: documentNumber,
      },
    },
    async (args) => {
      if (!args.volunteer_id && !args.document_number) {
        return errorText("Provide volunteer_id or document_number.");
      }
      const volunteer = await resolveVolunteer(store, args);
      if (!volunteer) return errorText("Volunteer not found.");

      const background = await runCromaBackgroundCheck(croma, {
        full_name: volunteer.full_name,
        document_number: volunteer.document_number,
        document_type: volunteer.document_type,
        company_name: volunteer.company_name,
      });

      const linkedin = validateLinkedIn({
        full_name: volunteer.full_name,
        linkedin_url: volunteer.linkedin_url,
      });

      const withData = await store.update(volunteer.id, {
        status: "in_review",
        linkedin_url: linkedin.normalized_url ?? volunteer.linkedin_url,
        verification_data: {
          ...(volunteer.verification_data ?? {}),
          croma: background,
          linkedin,
          verified_at: new Date().toISOString(),
        },
      });

      const report = generateReport(withData, background);
      const saved = await store.saveReport(withData.id, report);

      return jsonText({
        backend: store.backend,
        croma_available: croma.availability(),
        volunteer: {
          id: saved.id,
          full_name: saved.full_name,
          document_number: saved.document_number,
          status: saved.status,
        },
        linkedin,
        background,
        report,
      });
    },
  );
}

function asCromaBundle(verificationData: Record<string, unknown> | null) {
  if (!verificationData || typeof verificationData !== "object") {
    return {
      skipped: true as const,
      reason:
        "No prior Croma results stored. Run check_croma_background or verify_volunteer first.",
      judicial: null,
      criminal_records: null,
      procuraduria: null,
      rues: null,
    };
  }
  const croma = verificationData.croma;
  if (!croma || typeof croma !== "object") {
    return {
      skipped: true as const,
      reason:
        "No prior Croma results stored. Run check_croma_background or verify_volunteer first.",
      judicial: null,
      criminal_records: null,
      procuraduria: null,
      rues: null,
    };
  }
  return croma as {
    skipped?: boolean;
    reason?: string | null;
    judicial?: CromaCallResult | null;
    criminal_records?: CromaCallResult | null;
    procuraduria?: CromaCallResult | null;
    rues?: CromaCallResult | null;
  };
}
