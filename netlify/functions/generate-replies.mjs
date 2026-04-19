import Anthropic from '@anthropic-ai/sdk'
import {
  authUser,
  reviewsStore,
  json,
  badRequest,
  unauthorized,
  serverError,
  newId,
} from '../lib/common.mjs'

const anthropic = new Anthropic()

const REPLY_SYSTEM = `You are an expert customer experience writer who crafts thoughtful, professional, on-brand replies to online business reviews. Your replies must:
- Sound warm and human, never robotic.
- Acknowledge the customer specifically.
- Address concerns with empathy for negative reviews.
- Stay concise (2–4 sentences) unless a longer reply is clearly warranted.
- Never fabricate facts about the business, location, or promotions.
- Avoid generic filler like "We appreciate your feedback" alone.

Return ONLY a valid JSON array, no prose, no markdown fences. Each item must follow the schema:
{ "label": string, "reply": string }`

function buildReplyPrompt({ text, tone, count, businessName }) {
  return `Customer review:
"""
${text}
"""

${businessName ? `Business name (use naturally if helpful): ${businessName}\n` : ''}Tone: ${tone}
Number of distinct reply options to produce: ${count}

For each option, give a short descriptive label (e.g. "Warm & Grateful", "Direct Apology + Offer") followed by the reply text. Make each option feel genuinely different in angle or phrasing.

Return ONLY the JSON array.`
}

function extractJsonArray(raw) {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed : null
  } catch {}
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1))
      return Array.isArray(parsed) ? parsed : null
    } catch {}
  }
  return null
}

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405)
  }

  const auth = authUser(req)

  let body
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }

  const text = (body.text || '').toString().trim()
  const tone = (body.tone || 'Professional').toString()
  const count = Math.min(Math.max(parseInt(body.count, 10) || 4, 1), 6)
  const rating = body.rating ? Math.min(Math.max(parseInt(body.rating, 10), 1), 5) : null
  const customerName = (body.customer_name || '').toString().trim().slice(0, 80)
  const businessName = (body.business_name || '').toString().trim().slice(0, 120)
  const save = Boolean(body.save)

  if (!text) {
    return badRequest('Review text is required')
  }
  if (text.length > 4000) {
    return badRequest('Review text must be under 4000 characters')
  }

  try {
    const prompt = buildReplyPrompt({ text, tone, count, businessName })

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1200,
      temperature: 0.7,
      system: REPLY_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = (message.content || [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')

    let replies = extractJsonArray(rawText)
    if (!replies || replies.length === 0) {
      replies = [{ label: `${tone} reply`, reply: rawText.trim() }]
    }
    replies = replies
      .filter((r) => r && typeof r.reply === 'string' && r.reply.trim())
      .slice(0, count)
      .map((r, i) => ({
        label: (r.label || `Option ${i + 1}`).toString().slice(0, 80),
        reply: r.reply.toString().trim(),
      }))

    // Quick sentiment tag derived from rating or heuristics for analytics.
    let sentiment = 'neutral'
    if (rating !== null) {
      sentiment = rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral'
    } else {
      const lower = text.toLowerCase()
      const negWords = ['bad', 'worst', 'terrible', 'awful', 'slow', 'rude', 'disappointed', 'never', 'avoid']
      const posWords = ['great', 'excellent', 'amazing', 'love', 'wonderful', 'fantastic', 'perfect', 'best']
      const neg = negWords.some((w) => lower.includes(w))
      const pos = posWords.some((w) => lower.includes(w))
      sentiment = neg && !pos ? 'negative' : pos && !neg ? 'positive' : 'neutral'
    }

    let savedId = null
    if (save && auth) {
      const reviews = reviewsStore()
      const record = {
        id: newId(),
        user_id: auth.id,
        customer_name: customerName || 'Anonymous',
        business_name: businessName || null,
        rating,
        text,
        tone,
        sentiment,
        replies,
        status: 'pending',
        created_at: new Date().toISOString(),
      }
      await reviews.setJSON(`${auth.id}/${record.id}`, record)
      savedId = record.id
    }

    return json({
      success: true,
      tone,
      sentiment,
      replies,
      saved_id: savedId,
      model: 'claude-haiku-4-5',
    })
  } catch (err) {
    console.error('generate-replies error:', err)
    return serverError('Failed to generate replies. Please try again.')
  }
}

export const config = {
  path: '/api/generate-replies',
  method: 'POST',
}
