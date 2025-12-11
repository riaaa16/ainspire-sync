"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const sanity_1 = require("./sanity");
function mapFields(payload) {
    return {
        filloutId: payload.submission_id || payload.id || null,
        firstName: payload.firstName || payload.first_name || null,
        lastName: payload.lastName || payload.last_name || null,
        email: payload.email || null,
        major: payload.major || null,
        graduationYear: payload.graduationYear ? Number(payload.graduationYear) : null,
        linkedin: payload.linkedin || null,
        github: payload.github || null,
        personalWebsite: payload.personalWebsite || payload.website || null,
        calendly: payload.calendly || null,
        careerGoal: payload.careerGoal || null,
    };
}
async function handler(req, res) {
    if (req.method !== 'POST')
        return res.status(405).send({ error: 'Method not allowed' });
    // If you later add webhook signing in Fillout, reintroduce HMAC verification here.
    const payload = req.body || {};
    const submissionId = payload.submission_id || payload.id || null;
    const email = String(payload.email || '').toLowerCase().trim();
    const docId = submissionId ? `fillout-${(0, sanity_1.sanitizeId)(submissionId)}` : `member-${(0, sanity_1.sanitizeId)(email)}`;
    const fields = mapFields(payload);
    // Create if not exists first, then patch to avoid race where patch runs before creation
    const mutation = {
        mutations: [
            { createIfNotExists: { _id: docId, _type: 'memberProfile', email: fields.email } },
            { patch: { id: docId, set: fields } }
        ]
    };
    console.log('Sanity mutation:', JSON.stringify(mutation));
    try {
        const result = await (0, sanity_1.mutate)(mutation);
        return res.status(200).json({ ok: true, result });
    }
    catch (err) {
        console.error('Fillout handler error', err);
        const status = err?.status || 500;
        return res.status(status).json({ ok: false, error: err?.body || err?.message || String(err) });
    }
}
