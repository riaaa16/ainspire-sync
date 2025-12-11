"use strict";
/* Minimal Sanity HTTP helpers for Vercel serverless functions
   - Uses native fetch (Node 18+ / Vercel runtime)
   - Exports `mutate` for data/mutate and `query` for GROQ queries
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.mutate = mutate;
exports.query = query;
exports.sanitizeId = sanitizeId;
const PROJECT_ID = process.env.SANITY_PROJECT_ID || '';
const DATASET = process.env.SANITY_DATASET || 'production';
const TOKEN = process.env.SANITY_SERVICE_TOKEN || '';
if (!PROJECT_ID || !TOKEN) {
    // Not throwing here to keep functions importable in editors; runtime will error on call.
    console.warn('SANITY_PROJECT_ID or SANITY_SERVICE_TOKEN not set');
}
async function mutate(payload) {
    const url = `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/mutate/${DATASET}?returnIds=true`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    }
    catch (e) {
        json = { text };
    }
    if (!res.ok) {
        const err = new Error('Sanity mutate failed');
        err.status = res.status;
        err.body = json;
        throw err;
    }
    return json;
}
async function query(groq) {
    const url = `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(groq)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const json = await res.json();
    if (!res.ok) {
        const err = new Error('Sanity query failed');
        err.status = res.status;
        err.body = json;
        throw err;
    }
    return json;
}
function sanitizeId(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}
