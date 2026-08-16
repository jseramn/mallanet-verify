# Mallanet Verify MCP

Public MCP server for **Mallanet** NGO volunteer integrity checks. It cross-checks declared registration data against Colombian official sources via [Croma](https://docs.usecroma.com) and produces a **Pass / Alert / Fail** report.

License: MIT · Owner: [jseramn](https://github.com/jseramn) · Name: **Mallanet** (not Mayanet)

## Requirements

- Node.js **20+**
- Optional: `CROMA_API_KEY` (org key from [platform.usecroma.com](https://platform.usecroma.com))
- Optional: `DATABASE_URL` (Neon / Postgres). If unset, an **in-memory** store is used.

## Quick start (judge path)

```bash
git clone https://github.com/jseramn/mallanet-verify.git
cd mallanet-verify
npm install
cp .env.example .env   # then set CROMA_API_KEY
npm test
npm run build
npm run dev            # stdio MCP server
```

Sample demo cédula (always seeded):

```text
1127938850
```

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `CROMA_API_KEY` | No | Enables live Croma lookups. If missing, Croma checks return **Skipped** gracefully. |
| `DATABASE_URL` | No | Neon/Postgres URL. Uses schema **`verify`** only. Falls back to memory if unset or connect fails. |
| `CROMA_BASE_URL` | No | Default `https://api.croma.run` |

**Hard rule:** this server never `ALTER`s or writes to `public.volunteers`. Persistence lives in `verify.volunteers`.

No secrets are committed. Use `.env` locally (gitignored).

## MCP tools

| Tool | What it does |
| --- | --- |
| `list_pending_volunteers` | List volunteers with status `pending` or `data_requested` |
| `get_volunteer` | Fetch by `volunteer_id` or `document_number` |
| `request_verification_data` | Mark `data_requested` + return checklist / missing fields |
| `check_croma_background` | Call Croma: judicial, criminal records, Procuraduría, RUES |
| `validate_linkedin` | URL + name↔slug consistency (**no LinkedIn scraping**) |
| `generate_report` | Build Pass/Alert/Fail report from stored / provided evidence |
| `verify_volunteer` | End-to-end: Croma + LinkedIn + persist report |

### Report checks

Each report includes:

- `judicial` — Rama Judicial cases by name
- `criminal_records` — Policía Nacional antecedentes
- `procuraduria` — Procuraduría SIRI
- `rues` — RUES entity search (when `company_name` is declared)
- `linkedin_consistency` — declared `/in/` URL vs name tokens (no scraping)

Overall = worst of the five (`Fail` > `Alert` > `Pass`; `Skipped` does not fail the volunteer by itself).

## Cursor / Claude Desktop config (stdio)

```json
{
  "mcpServers": {
    "mallanet-verify": {
      "command": "node",
      "args": ["/absolute/path/to/mallanet-verify/dist/index.js"],
      "env": {
        "CROMA_API_KEY": "croma_live_..."
      }
    }
  }
}
```

Or during development:

```json
{
  "mcpServers": {
    "mallanet-verify": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mallanet-verify/src/index.ts"],
      "env": {
        "CROMA_API_KEY": "croma_live_..."
      }
    }
  }
}
```

## Example tool calls

List pending (includes demo CC `1127938850`):

```json
{ "name": "list_pending_volunteers", "arguments": {} }
```

Verify the demo volunteer:

```json
{
  "name": "verify_volunteer",
  "arguments": { "document_number": "1127938850" }
}
```

Validate LinkedIn only (no scraping):

```json
{
  "name": "validate_linkedin",
  "arguments": {
    "full_name": "JOSE RAMON DEMO",
    "linkedin_url": "https://www.linkedin.com/in/jose-ramon-demo"
  }
}
```

## Croma references

- Docs: https://docs.usecroma.com
- MCP endpoint (upstream): https://docs.usecroma.com/mcp-server
- This project is a **separate** Mallanet-owned stdio MCP that *calls* Croma’s REST API when `CROMA_API_KEY` is set.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

## License

MIT © jseramn / Mallanet
