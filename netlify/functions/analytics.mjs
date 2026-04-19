import {
  authUser,
  reviewsStore,
  json,
  unauthorized,
  serverError,
} from '../lib/common.mjs'

function startOfDayISO(d) {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy.toISOString().slice(0, 10)
}

export default async (req) => {
  const auth = authUser(req)
  if (!auth) return unauthorized()

  try {
    const store = reviewsStore()
    const { blobs } = await store.list({ prefix: `${auth.id}/` })
    const records = (
      await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))
    ).filter(Boolean)

    const total = records.length
    const responded = records.filter(
      (r) => r.status === 'responded' || r.selected_reply
    ).length
    const pending = total - responded

    const ratingSum = records.reduce((s, r) => s + (Number(r.rating) || 0), 0)
    const ratedCount = records.filter((r) => Number(r.rating) > 0).length
    const avgRating = ratedCount ? +(ratingSum / ratedCount).toFixed(2) : 0

    const sentiments = { positive: 0, neutral: 0, negative: 0 }
    const ratingBuckets = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    const toneCounts = {}
    const now = new Date()
    const days = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      days.push({ date: startOfDayISO(d), count: 0, responded: 0 })
    }
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]))

    for (const r of records) {
      const sentiment = (r.sentiment || 'neutral').toLowerCase()
      if (sentiments[sentiment] !== undefined) sentiments[sentiment]++
      const rating = Number(r.rating)
      if (rating >= 1 && rating <= 5) ratingBuckets[rating]++
      if (r.tone) toneCounts[r.tone] = (toneCounts[r.tone] || 0) + 1
      const day = startOfDayISO(new Date(r.created_at))
      if (byDate[day]) {
        byDate[day].count++
        if (r.status === 'responded' || r.selected_reply) byDate[day].responded++
      }
    }

    const responseRate = total ? Math.round((responded / total) * 100) : 0

    const recent = records
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        customer_name: r.customer_name,
        rating: r.rating,
        sentiment: r.sentiment,
        status: r.status,
        created_at: r.created_at,
        preview: (r.text || '').slice(0, 140),
      }))

    return json({
      success: true,
      summary: {
        total_reviews: total,
        responded,
        pending,
        response_rate: responseRate,
        average_rating: avgRating,
      },
      sentiment_breakdown: sentiments,
      rating_distribution: ratingBuckets,
      tone_usage: toneCounts,
      daily_activity: days,
      recent_reviews: recent,
    })
  } catch (err) {
    console.error('analytics error:', err)
    return serverError()
  }
}

export const config = {
  path: '/api/analytics',
  method: 'GET',
}
