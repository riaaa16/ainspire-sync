# AInspire-Sync

This repository contains small serverless HTTP handlers that forward form and Notion webhook data into Sanity. The functions are written in TypeScript and set up to run on Vercel.

**Files of interest**
- `fillout.ts` — handler for Fillout form submissions (root export). Re-exported at `api/fillout.ts` for Vercel.
- `notion-webhook.ts` — handler for Notion webhook payloads. Re-exported at `api/notion-webhook.ts` for Vercel.
- `sanity.ts` — Sanity HTTP helper utilities used by both handlers.

**Environment variables**
- `SANITY_PROJECT_ID` — (required) your Sanity project id
- `SANITY_DATASET` — (optional) defaults to `production`
- `SANITY_SERVICE_TOKEN` — (required) service token with write access to the dataset

Local development
1. Install dependencies:

```bash
npm install
```

2. Start the Vercel dev server. You can install the Vercel CLI globally or use the local dev dependency:

```bash
# install globally (recommended once)
npm i -g vercel

# start local dev server
vercel dev

# or use npx (may prompt for login):
npx vercel dev
```

3. Ensure the required environment variables are available in your shell. For a quick test you can export them on Windows Git Bash / WSL like:

```bash
export SANITY_PROJECT_ID=your_project_id
export SANITY_SERVICE_TOKEN=your_service_token
export SANITY_DATASET=production
```

Available local endpoints (while `vercel dev` runs):
- `POST http://localhost:3000/api/fillout`
- `POST http://localhost:3000/api/notion-webhook`

Webhook setup (what to point at which endpoint)
- **Fillout (form submissions):** Point Fillout's webhook to `https://<your-deployment>/api/fillout` (for example `https://ainspire-sync.vercel.app/api/fillout`). Fillout should POST a JSON body that includes at minimum `submission_id` or `id` and the form fields (email, firstName, lastName, etc.).
- **Notion (database row updates):** Point your Notion automation (or integration) to `https://<your-deployment>/api/notion-webhook` (for example `https://ainspire-sync.vercel.app/api/notion-webhook`). The handler accepts either:
	- a simplified `fields` object: `{ "fields": { "email":"...", "firstName":"...", "lastName":"...", "filloutId":"...", ... } }` (recommended), or
	- Notion's raw `properties` object containing the page's properties. The code maps common names (e.g. `First Name`, `Last Name`, `Email`, `Major`, `Graduation Year`, `LinkedIn`, `Github`, `Personal Website`, `Calendly`, `Career Goal`, `Fillout ID`).
- **Sanity:** Sanity does not need to send webhooks back into this project by default. `sanity.ts` is a helper client used by the handlers to write data into your Sanity dataset. If you do want Sanity to notify this service of dataset changes, configure a Sanity webhook to POST to one of your endpoints — but there is no built-in `/api/sanity` handler in this repo. If you need a Sanity webhook receiver, I can add a small `api/sanity-webhook.ts` that validates and processes Sanity webhook payloads.
- **Sanity:** This repo already includes `api/sanity-webhook.ts`. When configured as a Sanity webhook, it will receive `create` and `update` events for `memberProfile` documents and patch the matching Notion page by `filloutId`.

	To enable Sanity → Notion sync:
	- Set `NOTION_TOKEN` and `NOTION_DATABASE_ID` in your Vercel project environment variables.
	- Invite the Notion integration (the app tied to `NOTION_TOKEN`) to the Notion database (Share → Invite) so the integration can query and update pages.
	- Create a Sanity webhook (Project → API → Webhooks) that POSTs to `https://<your-deployment>/api/sanity-webhook` and triggers on `create` and `update` for the `memberProfile` type.

	Quick curl test example (replace domain and IDs):

	```bash
	curl -X POST "https://ainspire-sync.vercel.app/api/sanity-webhook" \
		-H "Content-Type: application/json" \
		-d '{"documents":[{"_id":"memberProfile-123","_type":"memberProfile","filloutId":"4b9a82e5-562e-442e-b877-7ad76e418258","firstName":"Jane","lastName":"Doe","email":"jane.doe@example.com"}]}'
	```

	The handler will look for `filloutId` on the incoming Sanity document, query your Notion DB for a row where the `Fillout ID` rich_text equals that value, and PATCH the Notion page properties with mapped fields from the Sanity document.

Deployment to Vercel
1. Login and link the project (one-time):

```bash
vercel login
vercel link
```

2. Configure project environment variables in the Vercel dashboard (Project → Settings → Environment Variables) or via the CLI:

```bash
vercel env add SANITY_PROJECT_ID production
vercel env add SANITY_SERVICE_TOKEN production
vercel env add SANITY_DATASET production
```

When adding the token, choose the appropriate Environment scope (`Preview`, `Production`, etc.).

3. Deploy:

```bash
vercel --prod
```

Notes and recommendations
- Keep `sanity.ts` at the repository root to make it easy to reuse and test; `api/*` files simply re-export the handlers so Vercel picks them up.
- The functions use the Node 18+ `fetch` API (Vercel Node 18 runtime). The `vercel.json` in this repo sets the runtime to `nodejs18.x`.
- For local quick tests (without Vercel), you can call the handlers directly with `ts-node` or write small scripts that import them and simulate `req`/`res` objects.

Troubleshooting
- If you get authentication or permission errors from Sanity, verify that `SANITY_SERVICE_TOKEN` has write access to the specified dataset.
- If `vercel dev` fails to start, try updating the Vercel CLI or running `npx vercel dev` instead.

Webhooks & Two-way sync
--------------------------------
Which endpoints to point each system at
- **Fillout (form provider)**: point Fillout webhook to `https://<your-deployment>/api/fillout` (e.g. `https://ainspire-sync.vercel.app/api/fillout`). Fillout should POST a JSON body including `submission_id` (or `id`) and form fields. The handler maps fields into Sanity.
- **Notion (database automation)**: point Notion automation to `https://<your-deployment>/api/notion-webhook` (e.g. `https://ainspire-sync.vercel.app/api/notion-webhook`). The integration accepts either a simplified `fields` object or Notion's raw `properties` object. The handler maps common column names (including `Fillout ID`, `First Name`, `Last Name`, `Email`, etc.).
- **Sanity -> Notion (optional two-way sync)**: this repo includes `api/sanity-webhook` which accepts Sanity webhook payloads and patches the matching Notion page using `Fillout ID` (the Sanity document must have `filloutId` populated). Use the Sanity dashboard to create a webhook that calls `https://<your-deployment>/api/sanity-webhook` on `create` and `update` for `memberProfile`.

Environment variables (summary)
- `SANITY_PROJECT_ID` — (required) your Sanity project id
- `SANITY_DATASET` — (optional) defaults to `production`
- `SANITY_SERVICE_TOKEN` — (required) service token with write access
- `NOTION_TOKEN` — (required for Sanity->Notion) Notion integration token with DB access
- `NOTION_DATABASE_ID` — (required for Sanity->Notion) Notion database id containing your rows (see "Find Notion DB ID")
- `NOTION_VERSION` — optional Notion API version (defaults to `2022-06-28`)

Find Notion Database ID
- Open the Notion database page in your browser (the full database view). The long hex id in the URL path is the database id. Example:

```
https://www.notion.so/workspace/2c51c816107d805ab1c8ebf8124137a4?v=... 
```

The database id is `2c51c816107d805ab1c8ebf8124137a4` (you can also use the dashed UUID form `2c51c816-107d-805a-b1c8-ebf8124137a4`).

PowerShell quick checks (recommended on Windows)
- Set env vars for this session:
```
$env:NOTION_TOKEN = "<your_notion_token>"
$env:NOTION_DATABASE_ID = "<your_db_id>"
$env:NOTION_VERSION = "2022-06-28"
```
- Get DB metadata:
```powershell
Invoke-RestMethod -Uri "https://api.notion.com/v1/databases/$($env:NOTION_DATABASE_ID)" -Method Get -Headers @{ "Authorization" = "Bearer $env:NOTION_TOKEN"; "Notion-Version" = $env:NOTION_VERSION }
```
- Query by Fillout ID (replace `$filloutId`):
```powershell
$filloutId = "4b9a82e5-562e-442e-b877-7ad76e418258"
$body = @{ filter = @{ property = "Fillout ID"; rich_text = @{ equals = $filloutId } }; page_size = 1 } | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri "https://api.notion.com/v1/databases/$($env:NOTION_DATABASE_ID)/query" -Method Post -Headers @{ "Authorization" = "Bearer $env:NOTION_TOKEN"; "Notion-Version" = $env:NOTION_VERSION; "Content-Type" = "application/json" } -Body $body
```

Bash / curl quick checks (use `--ssl-no-revoke` on Windows if curl schannel errors occur)
- Load local `.env` into your shell:
```bash
set -a
. .env
set +a
```
- DB metadata check:
```bash
curl -sS -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: ${NOTION_VERSION:-2022-06-28}" "https://api.notion.com/v1/databases/$NOTION_DATABASE_ID" | jq '.'
```
- Query DB for Fillout ID:
```bash
FILLOUT_ID="4b9a82e5-562e-442e-b877-7ad76e418258"
cat <<'JSON' > /tmp/notion_query.json
{
	"filter": { "property": "Fillout ID", "rich_text": { "equals": "'"${FILLOUT_ID}"'" } },
	"page_size": 1
}
JSON

curl -sS -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: ${NOTION_VERSION:-2022-06-28}" -H "Content-Type: application/json" -d @/tmp/notion_query.json "https://api.notion.com/v1/databases/$NOTION_DATABASE_ID/query" | jq '.'
```

Local testing & ngrok
- Start local dev: `npx vercel dev` (functions available at `http://localhost:3000/api/*`).
- Send test payloads with curl or PowerShell (examples earlier in this README).
- To let Notion call your local server, run `ngrok http 3000` and point Notion webhook to the `https://<ngrok>.ngrok.io/api/notion-webhook` URL.

Sanity webhook (Sanity -> Notion)
- This repo provides `api/sanity-webhook` which:
	- Accepts Sanity webhook payloads, finds `filloutId` on the Sanity document,
	- Queries your Notion database for a page where `Fillout ID` equals that value,
	- Patches the Notion page properties with mapped fields from Sanity.
- Configure the Sanity webhook in Sanity Cloud (Project → API → Webhooks) to POST to `https://<your-deployment>/api/sanity-webhook` on `create` and `update` for `memberProfile` documents.

Security & best practices
- Do NOT commit `.env` or secrets. Use Vercel Environment Variables for production.
- Add a shared-secret header to external webhooks (Fillout / Notion / Sanity) and verify it in the handlers.
- Invite the Notion integration (the app tied to `NOTION_TOKEN`) to the Notion database via Share → Add connection so the token can query/update pages.
- Consider adding retry/backoff and idempotency for Notion calls (rate limits, network errors).

Want help with any of these?
- I can add a small `scripts/notion-check.sh` or a Node test script that posts your saved `OUTPUT.json` to `api/notion-webhook` or `api/sanity-webhook` (avoids Windows curl TLS issues).  Tell me which you prefer and I will add it.

Want me to:
- add example curl payloads for quick testing, or
- add a small `test/` script that POSTs sample payloads to the local dev server?
 
Examples (curl)
1) Fillout-style payload to Fillout endpoint:

```bash
curl -X POST "https://ainspire-sync.vercel.app/api/fillout" \
	-H "Content-Type: application/json" \
	-d '{"submission_id":"abc123","email":"jane.doe@example.com","firstName":"Jane","lastName":"Doe"}'
```

2) Simplified Notion `fields` payload to Notion endpoint:

```bash
curl -X POST "https://ainspire-sync.vercel.app/api/notion-webhook" \
	-H "Content-Type: application/json" \
	-d '{"fields":{"email":"jane.doe@example.com","firstName":"Vercel","lastName":"Test","filloutId":"abc123"}}'
```

3) Raw Notion `properties` payload (uses CSV-like column names):

```bash
curl -X POST "https://ainspire-sync.vercel.app/api/notion-webhook" \
	-H "Content-Type: application/json" \
	-d '{"properties":{""First Name"":{"title":[{"plain_text":"Vercel"}]},"LinkedIn":{"url":"https://build.fillout.com/editor/preview/qqRyVub4LPus"},"Email":{"email":"vg435@njit.edu"},"Fillout ID":{"rich_text":[{"plain_text":"4b9a82e5-562e-442e-b877-7ad76e418258"}]}}}'
```

Security recommendations
- Add a shared secret header (for example `X-Webhook-Secret`) to your external webhooks and verify it inside the handlers to prevent unauthorized requests.
- Prefer sending a stable identifier (`filloutId`) from Fillout into Notion so the Notion webhook can include it and the handlers can deterministically target the correct Sanity document.

