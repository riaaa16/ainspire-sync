"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const sanity_1 = require("./sanity");
const NOTION_TOKEN = process.env.NOTION_TOKEN || '';
const NOTION_VERSION = process.env.NOTION_VERSION || '2022-06-28';
function mapNotionProperties(props) {
    // Expect a simplified object mapping here. Notion properties shape varies, so
    // callers may prefer to send a pre-mapped `fields` object. This helper attempts
    // to extract common property types.
    const getText = (p) => {
        if (!p)
            return null;
        if (typeof p === 'string')
            return p;
        if (p.title && p.title[0] && p.title[0].plain_text)
            return p.title[0].plain_text;
        if (p.rich_text && p.rich_text[0] && p.rich_text[0].plain_text)
            return p.rich_text[0].plain_text;
        if (p.select && p.select.name)
            return p.select.name;
        if (p.multi_select && p.multi_select.map)
            return p.multi_select.map((s) => s.name).join(', ');
        if (p.email)
            return p.email;
        if (p.url)
            return p.url;
        if (typeof p === 'number')
            return String(p);
        return null;
    };
    return {
        filloutId: getText(props.FilloutId) || getText(props['Fillout ID']) || getText(props.filloutId) || null,
        firstName: getText(props['First Name']) || getText(props.First) || getText(props.first) || null,
        lastName: getText(props['Last Name']) || getText(props.Last) || getText(props.last) || null,
        email: getText(props.Email) || getText(props['Email']) || getText(props.email) || null,
        major: getText(props.Major) || null,
        graduationYear: (() => {
            const v = getText(props['Graduation Year']) || getText(props.graduationYear);
            return v ? Number(v) : null;
        })(),
        linkedin: getText(props.LinkedIn) || getText(props['LinkedIn']) || null,
        github: getText(props.GitHub) || getText(props.Github) || getText(props.github) || null,
        personalWebsite: getText(props['Personal Website']) || getText(props.Website) || null,
        calendly: getText(props.Calendly) || getText(props['Calendly']) || null,
        careerGoal: getText(props['Career Goal']) || getText(props['CareerGoal']) || null,
    };
}
async function handler(req, res) {
    if (req.method !== 'POST')
        return res.status(405).send({ error: 'Method not allowed' });
    const body = req.body || {};
    // Debug log: show incoming body shape to Vercel logs (helps diagnose missing fields)
    try {
        console.log('Notion incoming body:', JSON.stringify(body));
    }
    catch (e) {
        console.log('Notion incoming body (non-json)');
    }
    // Accept multiple payload shapes:
    // - { properties: { ... } } (simple)
    // - { fields: { ... } } (simplified)
    // - Notion integration webhook: { entity: { id, type:'page' }, type: 'page.properties_updated' }
    //   In that case we fetch the page from the Notion API to obtain `properties`.
    // - { data: { properties: { ... } } } (older automation wrapper)
    let properties = null;
    // Integration webhook: fetch page properties when Notion sends a page event
    let integrationPageId = null;
    if (body && body.entity && body.entity.type === 'page' && typeof body.entity.id === 'string') {
        if (!NOTION_TOKEN) {
            console.warn('Received Notion integration webhook but NOTION_TOKEN not set; cannot fetch page');
        }
        else {
            try {
                const pageId = body.entity.id;
                integrationPageId = pageId;
                const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
                    headers: {
                        Authorization: `Bearer ${NOTION_TOKEN}`,
                        'Notion-Version': NOTION_VERSION,
                        'Content-Type': 'application/json'
                    }
                });
                const pageJson = await pageRes.json();
                if (!pageRes.ok) {
                    console.warn('Notion page fetch failed', pageRes.status, pageJson);
                }
                else if (pageJson && pageJson.properties) {
                    properties = pageJson.properties;
                }
            }
            catch (err) {
                console.warn('Error fetching Notion page properties', err);
            }
        }
    }
    // If this is a Notion integration deletion event (page deleted/removed), try to delete corresponding Sanity doc
    const isNotionDeleteEvent = typeof body.type === 'string' && /deleted|removed|archived/i.test(body.type);
    if (isNotionDeleteEvent && body.entity && body.entity.type === 'page' && body.entity.id) {
        const pageId = String(body.entity.id);
        // Try to determine Fillout ID or email from the fetched properties (if we had them)
        let pageFields = {};
        if (properties) {
            pageFields = mapNotionProperties(properties);
        }
        const filloutId = pageFields.filloutId || null;
        const email = pageFields.email ? String(pageFields.email).toLowerCase().trim() : null;
        // If we don't have any identifier from the page properties, skip deletion to avoid accidental removes
        if (!filloutId && !email) {
            console.log('Notion delete event received but no Fillout ID or email available; skipping');
            return res.status(200).json({ ok: true, skipped: true, message: 'no identifier available to find Sanity doc' });
        }
        try {
            // Prefer matching by Fillout ID in Sanity
            let groq = '';
            if (filloutId)
                groq = `*[_type==\"memberProfile\" && filloutId == \"${filloutId}\"]{_id}[0]`;
            else
                groq = `*[_type==\"memberProfile\" && email == \"${email}\"]{_id}[0]`;
            const qres = await (0, sanity_1.query)(groq);
            const sanityId = qres?.result?._id || (Array.isArray(qres?.result) && qres.result[0]?._id) || null;
            if (!sanityId) {
                console.log('No Sanity doc found for deleted Notion page via identifiers', { filloutId, email });
                return res.status(200).json({ ok: true, note: 'no matching Sanity doc to delete', identifier: { filloutId, email } });
            }
            // Delete the Sanity document
            const mutation = { mutations: [{ delete: { id: sanityId } }] };
            try {
                const result = await (0, sanity_1.mutate)(mutation);
                console.log('Deleted Sanity doc for Notion page', { pageId, sanityId });
                return res.status(200).json({ ok: true, deleted: sanityId, result });
            }
            catch (err) {
                console.error('Failed to delete Sanity doc for Notion page', err);
                return res.status(502).json({ ok: false, error: 'Sanity delete failed', detail: String(err) });
            }
        }
        catch (err) {
            console.warn('Error querying Sanity for identifiers on delete event', err);
            return res.status(502).json({ ok: false, error: 'Sanity query failed', detail: String(err) });
        }
    }
    // Fallbacks to older/simpler payload shapes
    if (!properties)
        properties = body.properties || body.fields || (body.data && (body.data.properties || body.data.fields)) || {};
    const fields = mapNotionProperties(properties);
    // normalize email for matching
    if (fields.email) {
        fields.email = String(fields.email).toLowerCase().trim();
    }
    // If there's no filloutId, do not make any changes — skip to avoid duplicates.
    if (!fields.filloutId) {
        console.log('No filloutId present — skipping Sanity changes to avoid duplicates');
        return res.status(200).json({ ok: true, skipped: true, message: 'no filloutId provided; no changes made' });
    }
    // From here on we have a filloutId and may create or patch deterministically
    let docId = null;
    let willCreate = false;
    const esc = (s) => String(s || '').replace(/"/g, '\\"');
    const candidateId = `fillout-${(0, sanity_1.sanitizeId)(fields.filloutId)}`;
    // Look for an existing document by filloutId or email to avoid duplicates
    const conds = [`filloutId == "${esc(fields.filloutId)}"`];
    if (fields.email)
        conds.push(`email == "${esc(fields.email)}"`);
    const groq = `*[_type == "memberProfile" && (${conds.join(' || ')})]{_id}[0]`;
    try {
        const qres = await (0, sanity_1.query)(groq);
        const foundId = qres?.result?._id || (Array.isArray(qres?.result) && qres.result[0]?._id) || null;
        if (foundId) {
            docId = foundId;
        }
        else {
            docId = candidateId;
            willCreate = true;
        }
    }
    catch (err) {
        console.warn('Notion handler sanity query failed', err);
        // If query fails, still prefer creating deterministically when filloutId exists
        docId = candidateId;
        willCreate = true;
    }
    // Build mutations: createIfNotExists only when we will create (filloutId present and not found)
    const mutations = [];
    if (willCreate && docId) {
        const createObj = { _id: docId, _type: 'memberProfile' };
        if (fields.email)
            createObj.email = fields.email;
        if (fields.filloutId)
            createObj.filloutId = fields.filloutId;
        mutations.push({ createIfNotExists: createObj });
        // Ensure filloutId is set on create and patch all fields
        mutations.push({ patch: { id: docId, set: { ...(fields.filloutId ? { filloutId: fields.filloutId } : {}), ...fields } } });
    }
    else if (docId) {
        mutations.push({ patch: { id: docId, set: fields } });
    }
    // (no notionId stored in Sanity) — do not persist Notion page id into Sanity schema
    const mutation = { mutations };
    console.log('Sanity mutation:', JSON.stringify(mutation));
    try {
        const result = await (0, sanity_1.mutate)(mutation);
        return res.status(200).json({ ok: true, result });
    }
    catch (err) {
        // Log full error details for Vercel logs
        const details = err?.body ?? err?.message ?? String(err);
        console.error('Notion handler error', { err, details });
        const status = err?.status || 500;
        const messages = [];
        if (err?.body?.message)
            messages.push(String(err.body.message));
        else if (err?.body && typeof err.body === 'string')
            messages.push(err.body);
        else if (err?.message)
            messages.push(String(err.message));
        else
            messages.push(String(err));
        return res.status(status).json({ ok: false, error: details, messages });
    }
}
