const NOTION_TOKEN = process.env.NOTION_TOKEN || ''
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || ''
const NOTION_VERSION = process.env.NOTION_VERSION || '2022-06-28'

function sanityDocFromPayload(body: any) {
  if (!body) return null
  return (
    body.document ||
    (Array.isArray(body.documents) && body.documents[0]) ||
    (Array.isArray(body.result) && body.result[0]) ||
    body
  )
}

function mapSanityToNotionProps(doc: any) {
  const props: any = {}

  const setTitle = (name: string, value: any) => {
    if (!value && value !== 0) return
    props[name] = { title: [{ text: { content: String(value) } }] }
  }

  const setRich = (name: string, value: any) => {
    if (!value && value !== 0) return
    props[name] = { rich_text: [{ text: { content: String(value) } }] }
  }

  const setUrl = (name: string, value: any) => {
    if (!value) return
    props[name] = { url: String(value) }
  }

  const setEmail = (name: string, value: any) => {
    if (!value) return
    props[name] = { email: String(value) }
  }

  const setNumber = (name: string, value: any) => {
    if (value === undefined || value === null) return
    const n = Number(value)
    if (Number.isNaN(n)) return
    props[name] = { number: n }
  }

  // Map fields (adjust names to match your Notion DB column names)
  // Use Fillout ID only for lookup — we don't overwrite it here
  setTitle('First Name', doc.firstName || doc['firstName'] || doc['First Name'])
  setRich('Last Name', doc.lastName || doc['lastName'] || doc['Last Name'])
  setEmail('Email', doc.email || doc['email'])
  setRich('Major', doc.major || doc['major'])
  setNumber('Graduation Year', doc.graduationYear || doc['graduationYear'])
  setUrl('LinkedIn', doc.linkedin || doc['linkedin'])
  setUrl('Github', doc.github || doc['github'])
  setUrl('Personal Website', doc.personalWebsite || doc['personalWebsite'])
  setUrl('Calendly', doc.calendly || doc['calendly'])
  setRich('Career Goal', doc.careerGoal || doc['careerGoal'])

  return props
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
    console.error('Missing NOTION_TOKEN or NOTION_DATABASE_ID env vars')
    return res.status(500).json({ ok: false, error: 'Notion credentials not configured' })
  }

  const body = req.body || {}
  try { console.log('Sanity webhook payload:', JSON.stringify(body)) } catch (e) { console.log('Sanity webhook payload (non-json)') }

  const doc = sanityDocFromPayload(body)
  if (!doc) return res.status(400).json({ ok: false, error: 'No document in webhook payload' })

  const filloutId = doc.filloutId || doc.filloutID || doc['Fillout ID'] || doc['filloutId'] || null
  const email = (doc.email || doc.Email || doc['Email'] || '').toString().toLowerCase() || null

  if (!filloutId && !email) {
    console.log('No filloutId or email on doc — ignoring')
    return res.status(200).json({ ok: true, note: 'no identifier (filloutId or email), nothing to sync' })
  }

  // Query Notion database to find page with matching Fillout ID property (preferred)
  const queryUrl = `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`
  let queryBody: any
  if (filloutId) {
    queryBody = {
      filter: {
        property: 'Fillout ID',
        rich_text: {
          equals: String(filloutId)
        }
      },
      page_size: 1
    }
  } else {
    // fallback: match by Email property in Notion
    queryBody = {
      filter: {
        property: 'Email',
        email: {
          equals: String(email)
        }
      },
      page_size: 1
    }
  }

  let pageId: string | null = null
  try {
    const qRes = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(queryBody)
    })
    const qJson = await qRes.json()
    if (!qRes.ok) {
      console.error('Notion query failed', qRes.status, qJson)
      return res.status(502).json({ ok: false, error: 'Notion query failed', detail: qJson })
    }
    if (Array.isArray(qJson.results) && qJson.results.length) {
      pageId = qJson.results[0].id
    } else {
      console.log('No Notion page found for identifier', { filloutId, email })
      return res.status(200).json({ ok: true, note: 'no Notion page matched for identifier', identifier: { filloutId, email } })
    }
  } catch (err) {
    console.error('Notion query error', err)
    return res.status(502).json({ ok: false, error: 'Notion query error', detail: String(err) })
  }

  // Build Notion properties from Sanity doc
  const notionProps = mapSanityToNotionProps(doc)
  if (Object.keys(notionProps).length === 0) {
    console.log('No updatable fields present on doc; nothing to update on Notion')
    return res.status(200).json({ ok: true, note: 'no updatable fields' })
  }

  // PATCH the page
  try {
    const patchUrl = `https://api.notion.com/v1/pages/${pageId}`
    const pRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties: notionProps })
    })
    const pJson = await pRes.json()
    if (!pRes.ok) {
      console.error('Notion update failed', pRes.status, pJson)
      return res.status(502).json({ ok: false, error: 'Notion update failed', detail: pJson })
    }

    console.log('Notion page updated', pageId)
    return res.status(200).json({ ok: true, result: pJson })
  } catch (err) {
    console.error('Notion update error', err)
    return res.status(502).json({ ok: false, error: 'Notion update error', detail: String(err) })
  }
}
