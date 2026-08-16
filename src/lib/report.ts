import type {
  CheckDetail,
  CheckResult,
  OverallResult,
  VerificationReport,
  Volunteer,
} from "./types.js";
import type { CromaCallResult } from "./croma.js";
import { validateLinkedIn } from "./linkedin.js";

function skipped(summary: string): CheckDetail {
  return { result: "Skipped", summary };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function scoreCriminalRecords(
  call: CromaCallResult | null | undefined,
): CheckDetail {
  if (!call || call.skipped) {
    return skipped(call?.error || "Croma criminal records check skipped.");
  }
  if (!call.ok) {
    return {
      result: "Alert",
      summary: `Criminal records lookup failed: ${call.error || "unknown error"}`,
      evidence: call,
    };
  }
  const data = asRecord(call.data);
  const hasRecords = Boolean(data?.has_records);
  if (hasRecords) {
    return {
      result: "Fail",
      summary:
        (typeof data?.status === "string" && data.status) ||
        "Policía Nacional reports pending judicial matters / criminal records.",
      evidence: data,
    };
  }
  return {
    result: "Pass",
    summary:
      (typeof data?.status === "string" && data.status) ||
      "No pending matters reported by Policía Nacional.",
    evidence: data,
  };
}

export function scoreProcuraduria(
  call: CromaCallResult | null | undefined,
): CheckDetail {
  if (!call || call.skipped) {
    return skipped(call?.error || "Croma Procuraduría check skipped.");
  }
  if (!call.ok) {
    return {
      result: "Alert",
      summary: `Procuraduría lookup failed: ${call.error || "unknown error"}`,
      evidence: call,
    };
  }
  const data = asRecord(call.data);
  if (data?.found === false) {
    return {
      result: "Alert",
      summary: "Document not found in Procuraduría SIRI registry.",
      evidence: data,
    };
  }
  if (data?.has_records) {
    return {
      result: "Fail",
      summary:
        (typeof data?.status === "string" && data.status) ||
        "Procuraduría reports antecedentes.",
      evidence: data,
    };
  }
  return {
    result: "Pass",
    summary:
      (typeof data?.status === "string" && data.status) ||
      "No Procuraduría antecedentes reported.",
    evidence: data,
  };
}

export function scoreJudicial(
  call: CromaCallResult | null | undefined,
): CheckDetail {
  if (!call || call.skipped) {
    return skipped(call?.error || "Croma judicial check skipped.");
  }
  if (!call.ok) {
    return {
      result: "Alert",
      summary: `Judicial lookup failed: ${call.error || "unknown error"}`,
      evidence: call,
    };
  }
  const data = asRecord(call.data);
  const cases = Array.isArray(data?.cases) ? data.cases : [];
  if (cases.length === 0) {
    return {
      result: "Pass",
      summary: "No Rama Judicial cases found for the declared name.",
      evidence: { case_count: 0 },
    };
  }
  return {
    result: "Alert",
    summary: `Found ${cases.length} Rama Judicial case(s) matching the name — manual review recommended.`,
    evidence: {
      case_count: cases.length,
      cases: cases.slice(0, 5),
    },
  };
}

export function scoreRues(
  call: CromaCallResult | null | undefined,
  companyName: string | null,
): CheckDetail {
  if (!companyName) {
    return {
      result: "Pass",
      summary: "No company declared; RUES check not applicable.",
    };
  }
  if (!call || call.skipped) {
    return skipped(call?.error || "Croma RUES check skipped.");
  }
  if (!call.ok) {
    return {
      result: "Alert",
      summary: `RUES lookup failed: ${call.error || "unknown error"}`,
      evidence: call,
    };
  }
  const data = asRecord(call.data);
  const entities = Array.isArray(data?.entities) ? data.entities : [];
  if (entities.length === 0) {
    return {
      result: "Alert",
      summary: `No RUES entities found for declared company "${companyName}".`,
      evidence: { query: companyName, entity_count: 0 },
    };
  }
  return {
    result: "Pass",
    summary: `RUES returned ${entities.length} entity match(es) for "${companyName}".`,
    evidence: {
      entity_count: entities.length,
      entities: entities.slice(0, 3),
    },
  };
}

export function scoreLinkedIn(volunteer: Volunteer): CheckDetail {
  const result = validateLinkedIn({
    full_name: volunteer.full_name,
    linkedin_url: volunteer.linkedin_url,
  });
  return {
    result: result.result,
    summary: result.summary,
    evidence: result,
  };
}

function worst(...results: CheckResult[]): OverallResult {
  if (results.includes("Fail")) return "Fail";
  if (results.includes("Alert")) return "Alert";
  return "Pass";
}

export interface BackgroundBundle {
  skipped?: boolean;
  reason?: string | null;
  judicial?: CromaCallResult | null;
  criminal_records?: CromaCallResult | null;
  procuraduria?: CromaCallResult | null;
  rues?: CromaCallResult | null;
}

export function generateReport(
  volunteer: Volunteer,
  background?: BackgroundBundle | null,
): VerificationReport {
  const bg = background ?? {
    skipped: true,
    reason: "No background payload provided.",
    judicial: null,
    criminal_records: null,
    procuraduria: null,
    rues: null,
  };

  const judicial =
    bg.skipped && !bg.judicial
      ? skipped(bg.reason || "Croma background skipped.")
      : scoreJudicial(bg.judicial);
  const criminal_records =
    bg.skipped && !bg.criminal_records
      ? skipped(bg.reason || "Croma background skipped.")
      : scoreCriminalRecords(bg.criminal_records);
  const procuraduria =
    bg.skipped && !bg.procuraduria
      ? skipped(bg.reason || "Croma background skipped.")
      : scoreProcuraduria(bg.procuraduria);
  const rues =
    bg.skipped && !bg.rues
      ? skipped(bg.reason || "Croma background skipped.")
      : scoreRues(bg.rues, volunteer.company_name);
  const linkedin_consistency = scoreLinkedIn(volunteer);

  const overall = worst(
    judicial.result,
    criminal_records.result,
    procuraduria.result,
    rues.result,
    linkedin_consistency.result,
  );

  const notes: string[] = [];
  if (bg.skipped) {
    notes.push(
      bg.reason ||
        "Croma checks were skipped (set CROMA_API_KEY to enable live lookups).",
    );
  }
  notes.push(
    "LinkedIn validation uses declared URL + name consistency only — no LinkedIn scraping.",
  );

  return {
    volunteer_id: volunteer.id,
    document_number: volunteer.document_number,
    full_name: volunteer.full_name,
    overall,
    generated_at: new Date().toISOString(),
    checks: {
      judicial,
      criminal_records,
      procuraduria,
      rues,
      linkedin_consistency,
    },
    notes,
  };
}
