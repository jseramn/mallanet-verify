# Mayanet Verify MCP

Stdio MCP that checks a volunteer against Colombian public sources (Croma) and stores a **Pass / Alert / Fail** report in an isolated Neon schema `verify`. It never reads or alters intake (`public.volunteers`).

License: MIT. LinkedIn is URL-normalize only — no profile fetch.

## Quick path

1. `npm install` (Node 20+).
2. Put a **verify-scoped** Postgres URL and a Croma key in `.env` (copy `.env.example`).
3. Apply schema once: `psql "$DATABASE_URL" -f sql/001_verify_schema.sql`
4. Point Cursor at this repo (stdio block below) and reload MCP.
5. Call `verify_volunteer` with `volunteer_id: "verify-operator-001"` after the document is bound.

Expected: a JSON report with `overall_status` and per-check statuses. Seed fixture is **Example Operator** / CC `1000000000` / id `verify-operator-001`.

## Explain

| Topic | Decision |
|-------|----------|
| Who uses it | Any MCP client (Cursor, Claude). No GUI in this repo. |
| Data plane | Schema `verify` only. Least-privilege role: DML there, no DDL, no `public`. |
| Colombia | Croma REST (`api.croma.run`): Policía, Procuraduría, Rama Judicial (by **name**), RUES if NIT/employer. |
| LinkedIn | Store/normalize a URL. `linkedin_consistency` stays **Alert** until a consented OAuth check exists. |
| Orchestrator | `verify_volunteer` runs Croma + URL normalize + persist. Source tools stay independently callable. |

Out of scope: UI, WhatsApp/email, numeric scores, biometrics, LinkedIn scraping, Registraduría, bulk-copy of intake rows.

## Stand up

### Requirements

- Node.js 20+
- `DATABASE_URL` — Postgres role that can DML `verify` only
- `CROMA_API_KEY` — org bearer (`croma_live_…`)
- `psql` once, to apply SQL

```
DATABASE_URL=<verify-scoped-postgres-url>
CROMA_API_KEY=<croma-api-key>
```

Do not commit `.env`. Runtime **never** runs DDL.

### Schema (once)

```bash
psql "$DATABASE_URL" -f sql/001_verify_schema.sql
```

Creates `verify.volunteers`, `verify.verification_requests`, `verify.verification_reports`, and seeds `verify-operator-001`. Re-apply is safe (`ON CONFLICT (document_number) DO NOTHING`).

Rollback: `DROP SCHEMA verify CASCADE`. Never `ALTER` `public.volunteers`.

### Cursor (stdio)

`npm install`, then user `~/.cursor/mcp.json` or project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mayanet-verify": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/absolute/path/to/mallanet-verify",
      "env": {
        "DATABASE_URL": "<verify-scoped-postgres-url>",
        "CROMA_API_KEY": "<croma-api-key>"
      }
    }
  }
}
```

Missing env aborts **before** tools register. Reload MCP after edits.

Smoke (stdin close exits 0 if env is set):

```bash
printf '' | DATABASE_URL="<verify-scoped-postgres-url>" CROMA_API_KEY="<croma-api-key>" npx tsx src/index.ts
```

## Operate

### First verify (seed)

The SQL seed is already bound (`document_number` = `1000000000`). After MCP is live:

1. `list_pending_volunteers` `{ "limit": 20, "status_filter": "pending" }` — expect `verify-operator-001` until a report exists.
2. `get_volunteer` `{ "volunteer_id": "verify-operator-001" }` — confirm the row.
3. `verify_volunteer` `{ "volunteer_id": "verify-operator-001" }` — Croma + persist.

To bind a **different** person (never commit a real cédula):

```json
{
  "volunteer_id": "verify-operator-001",
  "document_type": "CC",
  "document_number": "<document-number>",
  "linkedin_url": "https://www.linkedin.com/in/example"
}
```

That is `request_verification_data`. Then `verify_volunteer` again. Without `document_number` the orchestrator throws `identity unbound`. Unknown id throws `volunteer not found`.

### Tools

| Tool | Required | Optional | Role |
|------|----------|----------|------|
| `list_pending_volunteers` | — | `limit` (1–100, default 20), `status_filter` | Rows in `verify.volunteers` with **no** report |
| `get_volunteer` | `volunteer_id` | — | One row |
| `request_verification_data` | `volunteer_id`, `document_number` | `document_type` (default `CC`), `linkedin_url` | Bind identity; **never logged** |
| `check_croma_background` | — | `document_number`, `name`, `document_type`, `nit`, `employer` | Croma only; RUES if NIT/employer |
| `validate_linkedin` | `linkedin_url` | `volunteer_id` | Normalize URL; `fetched: false` |
| `generate_report` | `volunteer_id` | — | Croma + persist (same persist path as orchestrator) |
| `verify_volunteer` | `volunteer_id` | — | Request row + persist report |

### Report shape

```json
{
  "volunteer_id": "verify-operator-001",
  "name": "Example Operator",
  "overall_status": "Pass",
  "checks": {
    "judicial": "Pass",
    "criminal_records": "Pass",
    "procuraduria": "Pass",
    "rues": "N/A",
    "linkedin_consistency": "Alert"
  },
  "findings": [],
  "linkedin_summary": { "headline": "", "experience": [], "education": [] },
  "timestamp": "2026-08-16T00:00:00.000Z"
}
```

### Heuristics

| Check | Pass | Alert | Fail |
|-------|------|-------|------|
| Policía / Procuraduría | `has_records=false` | upstream error | `has_records=true` |
| Rama Judicial | no cases | any cases **or** error (name search; never auto-Fail) | — |
| RUES | found and employer matches | not found, mismatch, or error | — |
| RUES skipped | — | — | `N/A` (no NIT/employer) |
| LinkedIn | — | always, until consented OAuth | — |

**Overall:** any Fail → Fail; else any Alert → Alert; else Pass. `N/A` is ignored. One source failing does not abort the others.

### Limits and failures

- Croma default quota is **100 requests/day/org**. One `verify_volunteer` is several calls.
- Policía can take ~55s (202 poll in-process). Host MCP timeouts may fire first.
- Logs may include `volunteer_id` and document **type**. They must never include `document_number`.

## Tests

```bash
npm test
```

No live Croma in CI. Isolation tests assert the SQL never touches `public`.

## Checklist

- [ ] `.env` set, not committed
- [ ] `sql/001_verify_schema.sql` applied to a verify-scoped database
- [ ] Cursor MCP reloaded; tools visible
- [ ] `get_volunteer` returns `verify-operator-001`
- [ ] `verify_volunteer` returns `overall_status` + `checks`
- [ ] `npm test` is green
