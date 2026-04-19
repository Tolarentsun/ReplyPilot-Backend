import {
  authUser,
  reviewsStore,
  json,
  unauthorized,
  serverError,
  badRequest,
} from '../lib/common.mjs'

async function listForUser(userId) {
  const store = reviewsStore()
  const { blobs } = await store.list({ prefix: `${userId}/` })
  const keys = blobs.map((b) => b.key)
  const items = await Promise.all(
    keys.map((k) => store.get(k, { type: 'json' }))
  )
  return items
    .filter(Boolean)
    .sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
}

export default async (req) => {
  const auth = authUser(req)
  if (!auth) return unauthorized()

  const url = new URL(req.url)
  const idFromPath = url.pathname.replace(/^\/api\/reviews\/?/, '').trim()

  try {
    const store = reviewsStore()

    if (req.method === 'GET') {
      if (idFromPath) {
        const record = await store.get(`${auth.id}/${idFromPath}`, { type: 'json' })
        if (!record) return json({ success: false, error: 'Not found' }, 404)
        return json({ success: true, review: record })
      }
      const reviews = await listForUser(auth.id)
      return json({ success: true, reviews })
    }

    if (req.method === 'PATCH') {
      if (!idFromPath) return badRequest('Review id required')
      let body
      try {
        body = await req.json()
      } catch {
        return badRequest('Invalid JSON body')
      }
      const key = `${auth.id}/${idFromPath}`
      const existing = await store.get(key, { type: 'json' })
      if (!existing) return json({ success: false, error: 'Not found' }, 404)
      const updated = {
        ...existing,
        status: body.status || existing.status,
        selected_reply: typeof body.selected_reply === 'string' ? body.selected_reply : existing.selected_reply,
        notes: typeof body.notes === 'string' ? body.notes : existing.notes,
        updated_at: new Date().toISOString(),
      }
      await store.setJSON(key, updated)
      return json({ success: true, review: updated })
    }

    if (req.method === 'DELETE') {
      if (!idFromPath) return badRequest('Review id required')
      await store.delete(`${auth.id}/${idFromPath}`)
      return json({ success: true })
    }

    return json({ success: false, error: 'Method not allowed' }, 405)
  } catch (err) {
    console.error('reviews error:', err)
    return serverError()
  }
}

export const config = {
  path: ['/api/reviews', '/api/reviews/:id'],
}
