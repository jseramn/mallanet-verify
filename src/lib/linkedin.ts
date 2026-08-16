/**
 * LinkedIn validation without scraping.
 * Validates URL shape and name↔slug consistency from declared data only.
 */

export interface LinkedInValidationInput {
  full_name: string;
  linkedin_url: string | null | undefined;
}

export interface LinkedInValidationResult {
  valid_url: boolean;
  consistent: boolean;
  result: "Pass" | "Alert" | "Fail";
  summary: string;
  normalized_url: string | null;
  slug: string | null;
  name_tokens: string[];
  matched_tokens: string[];
}

const LINKEDIN_PROFILE_RE =
  /^https?:\/\/((www|co|es|mx|br|pe)\.)?linkedin\.com\/in\/([A-Za-z0-9_-]+)\/?(\?.*)?$/i;

function tokenizeName(fullName: string): string[] {
  return fullName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
    .filter((t) => !["de", "del", "la", "las", "los", "da", "do", "y", "e"].includes(t));
}

function tokenizeSlug(slug: string): string[] {
  return slug
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
    .filter((t) => !/^\d+$/.test(t));
}

export function validateLinkedIn(
  input: LinkedInValidationInput,
): LinkedInValidationResult {
  const nameTokens = tokenizeName(input.full_name || "");

  if (!input.linkedin_url || !input.linkedin_url.trim()) {
    return {
      valid_url: false,
      consistent: false,
      result: "Alert",
      summary: "No LinkedIn URL declared; consistency cannot be confirmed.",
      normalized_url: null,
      slug: null,
      name_tokens: nameTokens,
      matched_tokens: [],
    };
  }

  const raw = input.linkedin_url.trim();
  const match = LINKEDIN_PROFILE_RE.exec(raw);
  if (!match) {
    return {
      valid_url: false,
      consistent: false,
      result: "Fail",
      summary:
        "LinkedIn URL is not a valid public /in/ profile URL (no scraping performed).",
      normalized_url: null,
      slug: null,
      name_tokens: nameTokens,
      matched_tokens: [],
    };
  }

  const slug = match[3];
  const slugTokens = tokenizeSlug(slug);
  const matched = nameTokens.filter((nt) =>
    slugTokens.some((st) => st === nt || st.startsWith(nt) || nt.startsWith(st)),
  );

  const normalized = `https://www.linkedin.com/in/${slug}`;

  // Require at least one strong name token match when the name has tokens.
  if (nameTokens.length === 0) {
    return {
      valid_url: true,
      consistent: false,
      result: "Alert",
      summary: "Valid LinkedIn URL, but volunteer name is too short to compare.",
      normalized_url: normalized,
      slug,
      name_tokens: nameTokens,
      matched_tokens: matched,
    };
  }

  if (matched.length === 0) {
    return {
      valid_url: true,
      consistent: false,
      result: "Alert",
      summary:
        "LinkedIn URL shape is valid, but the profile slug does not match declared name tokens (consistency alert; no scraping).",
      normalized_url: normalized,
      slug,
      name_tokens: nameTokens,
      matched_tokens: matched,
    };
  }

  return {
    valid_url: true,
    consistent: true,
    result: "Pass",
    summary: `LinkedIn URL valid; slug consistent with declared name (${matched.join(", ")}). No scraping performed.`,
    normalized_url: normalized,
    slug,
    name_tokens: nameTokens,
    matched_tokens: matched,
  };
}
