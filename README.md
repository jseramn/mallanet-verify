# Mayanet Verify MCP

Stdio MCP server that verifies Mayanet volunteers against Colombian public sources (Croma) and persists Pass / Alert / Fail reports in an isolated Neon `verify` schema. Intake (`public.volunteers`) is never altered.

License: MIT.

## Requirements

- Node.js 20 or newer
- A **verify-scoped** Postgres role (`DATABASE_URL`) with DML on `verify` only — no runtime DDL, no access to other schemas
- A Croma API key (`CROMA_API_KEY`)

Copy `.env.example` and fill in values locally. Do not commit secrets.

```
DATABASE_URL=<verify-scoped-postgres-url>
CROMA_API_KEY=<croma-api-key>
```

## Apply the schema once

Runtime never runs DDL. Apply the isolated schema once against the verify-scoped database:

```bash
psql "$DATABASE_URL" -f sql/001_verify_schema.sql
```

Rollback: `DROP SCHEMA verify CASCADE`. Do not `ALTER` `public.volunteers`.

## Run in Cursor (stdio)

1. `npm install` in this repo.
2. Open Cursor Settings → MCP, or edit `~/.cursor/mcp.json` (user) / `.cursor/mcp.json` (project).
3. Add a **stdio** server that spawns this process (absolute `cwd`):

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

The process speaks MCP over stdin/stdout. Missing `DATABASE_URL` or `CROMA_API_KEY` aborts before tools register. Restart Cursor (or reload MCP) after editing the config.

Manual smoke (stdin close exits):

```bash
printf '' | DATABASE_URL="<verify-scoped-postgres-url>" CROMA_API_KEY="<croma-api-key>" npx tsx src/index.ts
```

## Tools

Each tool is independently callable. `verify_volunteer` orchestrates Croma + LinkedIn URL normalize + persist; you can still call the source tools alone.

| Tool | Input (placeholders) | Role |
|------|----------------------|------|
| `list_pending_volunteers` | `{ "limit": 20, "status_filter": "pending" }` | Volunteers with no report row |
| `get_volunteer` | `{ "volunteer_id": "<volunteer-id>" }` | One `verify.volunteers` row |
| `request_verification_data` | `{ "volunteer_id": "<volunteer-id>", "document_type": "CC", "document_number": "<document-number>", "linkedin_url": "https://www.linkedin.com/in/example" }` | Bind identity; never log the number |
| `check_croma_background` | `{ "document_number": "<document-number>", "name": "<full-name>", "nit": "<nit>", "employer": "<employer>" }` | Policía, Procuraduría, Rama; RUES only if NIT/employer |
| `validate_linkedin` | `{ "linkedin_url": "https://www.linkedin.com/in/example", "volunteer_id": "<volunteer-id>" }` | Normalize URL only; no profile fetch |
| `generate_report` | `{ "volunteer_id": "<volunteer-id>" }` | Persist overall + per-check |
| `verify_volunteer` | `{ "volunteer_id": "<volunteer-id>" }` | Orchestrator |

Name/org mismatch on RUES is Alert, not Fail. LinkedIn stays Alert until a consented profile check exists.

## Tests

```bash
npx vitest run
```

No live Croma in CI. Optional DB tests use `DATABASE_URL` against `verify` only.
