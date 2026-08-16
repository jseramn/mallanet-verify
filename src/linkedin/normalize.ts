const HOST = /(^|\.)linkedin\.com$/i;

/** Canonicalize a LinkedIn URL. Never fetches or extracts a profile. */
export function normalizeLinkedInUrl(raw: string): string {
  const url = new URL(raw);
  if (!HOST.test(url.hostname)) {
    throw new Error("not a LinkedIn URL");
  }
  url.protocol = "https:";
  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}
