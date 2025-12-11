import { query, mutate, sanitizeId } from './sanity'

function mapNotionProperties(props: any) {
  // Expect a simplified object mapping here. Notion properties shape varies, so
  // callers may prefer to send a pre-mapped `fields` object. This helper attempts
  // to extract common property types.
  const getText = (p: any) => {
    if (!p) return null
    if (typeof p === 'string') return p
    if (p.title && p.title[0] && p.title[0].plain_text) return p.title[0].plain_text
    if (p.rich_text && p.rich_text[0] && p.rich_text[0].plain_text) return p.rich_text[0].plain_text
    if (p.select && p.select.name) return p.select.name
    if (p.multi_select && p.multi_select.map) return p.multi_select.map((s: any) => s.name).join(', ')
    if (p.email) return p.email
    if (p.url) return p.url
    if (typeof p === 'number') return String(p)
    return null
  }

  return {
    filloutId:
      getText(props.FilloutId) || getText(props['Fillout ID']) || getText(props.filloutId) || null,
    firstName:
      getText(props['First Name']) || getText(props.First) || getText(props.first) || null,
    lastName:
      getText(props['Last Name']) || getText(props.Last) || getText(props.last) || null,
    email: getText(props.Email) || getText(props['Email']) || getText(props.email) || null,
    major: getText(props.Major) || null,
    graduationYear: (() => {
      const v = getText(props['Graduation Year']) || getText(props.graduationYear)
      return v ? Number(v) : null
    })(),
    linkedin: getText(props.LinkedIn) || getText(props['LinkedIn']) || null,
    github: getText(props.GitHub) || getText(props.Github) || getText(props.github) || null,
    personalWebsite: getText(props['Personal Website']) || getText(props.Website) || null,
    calendly: getText(props.Calendly) || getText(props['Calendly']) || null,
    careerGoal: getText(props['Career Goal']) || getText(props['CareerGoal']) || null,
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send({ error: 'Method not allowed' })

  const body = req.body || {}

  // Debug log: show incoming body shape to Vercel logs (helps diagnose missing fields)
  try { console.log('Notion incoming body:', JSON.stringify(body)) } catch (e) { console.log('Notion incoming body (non-json)') }

  // Accept multiple payload shapes:
  // - { properties: { ... } } (simple)
  // - { fields: { ... } } (simplified)
  // - { data: { properties: { ... } } } (Notion automation wrapper)
  const properties = body.properties || body.fields || (body.data && (body.data.properties || body.data.fields)) || {}
  const fields = mapNotionProperties(properties)

  // normalize email for matching
  if (fields.email) {
    fields.email = String(fields.email).toLowerCase().trim()
  }

  // Determine target docId: prefer filloutId, else look up by email
  let docId = null
  if (fields.filloutId) {
    docId = `fillout-${sanitizeId(fields.filloutId)}`
  } else if (fields.email) {
    // Query Sanity for doc with this email
    const groq = `*[_type == \"memberProfile\" && email == \"${fields.email}\"]{_id}[0]`
    try {
      const qres = await query(groq)
      docId = qres?.result?._id || qres?.result?._ref || (qres?.result && qres.result._id) || null
      if (!docId && qres?.result?._id === undefined) {
        // some Sanity responses put data in `result` array
        if (Array.isArray(qres?.result) && qres.result.length) docId = qres.result[0]._id
      }
    } catch (err) {
      console.warn('Notion handler sanity query failed', err)
    }
  }

  // If still no docId, create one based on email if present
  if (!docId && fields.email) docId = `member-${sanitizeId(fields.email)}`
  if (!docId) return res.status(400).json({ ok: false, error: 'Cannot determine target document id' })

  // Ensure the document exists first, then patch its fields
  const createObj: any = { _id: docId, _type: 'memberProfile' }
  if (fields.email) createObj.email = fields.email

  const mutation = {
    mutations: [
      { createIfNotExists: createObj },
      { patch: { id: docId, set: fields } }
    ]
  }

  console.log('Sanity mutation:', JSON.stringify(mutation))

  try {
    const result = await mutate(mutation)
    return res.status(200).json({ ok: true, result })
  } catch (err: any) {
    // Log full error details for Vercel logs
    const details = err?.body ?? err?.message ?? String(err)
    console.error('Notion handler error', { err, details })
    const status = err?.status || 500
    const messages = [] as string[]
    if (err?.body?.message) messages.push(String(err.body.message))
    else if (err?.body && typeof err.body === 'string') messages.push(err.body)
    else if (err?.message) messages.push(String(err.message))
    else messages.push(String(err))

    return res.status(status).json({ ok: false, error: details, messages })
  }
}