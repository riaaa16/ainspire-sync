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

Want me to:
- add example curl payloads for quick testing, or
- add a small `test/` script that POSTs sample payloads to the local dev server?
