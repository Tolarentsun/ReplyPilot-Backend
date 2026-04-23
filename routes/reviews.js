const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const axios = require('axios');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Get all reviews
router.get('/', authenticate, async (req, res) => {
  try {
    const { platform, sentiment, rating, page = 1, limit = 20, sort = 'newest' } = req.query;

    const sortMap = { newest: 'review_date DESC', oldest: 'review_date ASC', highest: 'rating DESC', lowest: 'rating ASC' };
    const orderBy = sortMap[sort] || 'review_date DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = 'user_id = ?';
    const params = [req.user.id];

    if (platform && platform !== 'all') { where += ' AND platform = ?'; params.push(platform); }
    if (sentiment && sentiment !== 'all') { where += ' AND sentiment = ?'; params.push(sentiment); }
    if (rating && rating !== 'all') { where += ' AND rating = ?'; params.push(parseInt(rating)); }

    const reviews = await db.asyncAll(
      `SELECT * FROM reviews WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const countRow = await db.asyncGet(`SELECT COUNT(*) as total FROM reviews WHERE ${where}`, params);
    const total = countRow?.total || 0;

    res.json({
      success: true,
      reviews: reviews.map(r => ({ ...r, keywords: r.keywords ? JSON.parse(r.keywords) : [] })),
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (err) {
    console.error('Get reviews error:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Analytics
router.get('/analytics', authenticate, async (req, res) => {
  try {
    const uid = req.user.id;

    const totals = await db.asyncGet(`
      SELECT COUNT(*) as total_reviews, AVG(rating) as avg_rating,
        SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
        SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative_count,
        SUM(CASE WHEN response_status = 'responded' THEN 1 ELSE 0 END) as responded_count,
        SUM(CASE WHEN response_status != 'responded' THEN 1 ELSE 0 END) as pending_count
      FROM reviews WHERE user_id = ?`, [uid]);

    const ratingDist = await db.asyncAll(
      `SELECT rating, COUNT(*) as count FROM reviews WHERE user_id = ? GROUP BY rating ORDER BY rating DESC`, [uid]);

    const platformDist = await db.asyncAll(
      `SELECT platform, COUNT(*) as count, AVG(rating) as avg_rating FROM reviews WHERE user_id = ? GROUP BY platform`, [uid]);

    const monthlyTrend = await db.asyncAll(`
      SELECT SUBSTRING(review_date, 1, 7) as month, COUNT(*) as count, AVG(rating) as avg_rating,
        SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive
      FROM reviews WHERE user_id = ?
      GROUP BY SUBSTRING(review_date, 1, 7)
      ORDER BY month DESC LIMIT 12`, [uid]);

    const allReviews = await db.asyncAll(`SELECT keywords FROM reviews WHERE user_id = ? AND keywords IS NOT NULL`, [uid]);
    const keywordCounts = {};
    allReviews.forEach(r => {
      try { JSON.parse(r.keywords).forEach(kw => { keywordCounts[kw] = (keywordCounts[kw] || 0) + 1; }); } catch(e) {}
    });
    const topKeywords = Object.entries(keywordCounts).sort((a,b) => b[1]-a[1]).slice(0,10).map(([word,count]) => ({ word, count }));

    const total = parseInt(totals?.total_reviews) || 0;
    const responded = parseInt(totals?.responded_count) || 0;

    res.json({
      success: true,
      analytics: {
        totals: {
          total_reviews: total,
          avg_rating: Math.round((parseFloat(totals?.avg_rating) || 0) * 10) / 10,
          positive_count: parseInt(totals?.positive_count) || 0,
          neutral_count: parseInt(totals?.neutral_count) || 0,
          negative_count: parseInt(totals?.negative_count) || 0,
          responded_count: responded,
          pending_count: parseInt(totals?.pending_count) || 0,
          response_rate: total > 0 ? Math.round((responded / total) * 100) : 0
        },
        rating_distribution: ratingDist,
        platform_distribution: platformDist,
        monthly_trend: monthlyTrend.reverse(),
        top_keywords: topKeywords
      }
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Add review
router.post('/', authenticate, async (req, res) => {
  try {
    const { reviewer_name, rating, review_text, platform, review_date } = req.body;
    if (!reviewer_name || !rating || !review_text) return res.status(400).json({ error: 'reviewer_name, rating, and review_text are required' });

    // Enforce free plan review limit
    if (req.user.plan === 'free') {
      const countRow = await db.asyncGet('SELECT COUNT(*) as total FROM reviews WHERE user_id = ?', [req.user.id]);
      if ((countRow?.total || 0) >= 25) {
        return res.status(403).json({ error: 'Free plan limit reached (25 reviews). Upgrade to Pro for unlimited reviews.', upgrade_required: true });
      }
    }

    const { sentiment, sentiment_score, keywords } = analyzeSentiment(review_text, rating);
    const id = generateId();

    // Normalize date to YYYY-MM-DD
    let normalizedDate = new Date().toISOString().split('T')[0];
    if (review_date) {
      const d = new Date(review_date);
      if (!isNaN(d.getTime())) normalizedDate = d.toISOString().split('T')[0];
    }

    await db.asyncRun(
      `INSERT INTO reviews (id, user_id, platform, reviewer_name, rating, review_text, review_date, sentiment, sentiment_score, keywords, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
      [id, req.user.id, platform || 'google', reviewer_name, parseInt(rating), review_text, normalizedDate, sentiment, sentiment_score, JSON.stringify(keywords)]
    );

    const review = await db.asyncGet('SELECT * FROM reviews WHERE id = ?', [id]);
    res.json({ success: true, review: { ...review, keywords: JSON.parse(review.keywords || '[]') } });
  } catch (err) {
    console.error('Add review error:', err.message);
    res.status(500).json({ error: 'Failed to add review: ' + err.message });
  }
});

// Generate AI response
router.post('/:id/generate-response', authenticate, async (req, res) => {
  try {
    const review = await db.asyncGet('SELECT * FROM reviews WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    // Enforce free plan AI response limit (5 per month)
    if (req.user.plan === 'free') {
      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const usedRow = await db.asyncGet(
        'SELECT COUNT(*) as total FROM ai_generations WHERE user_id = ? AND created_at >= ?',
        [req.user.id, monthStart.toISOString()]
      );
      if ((usedRow?.total || 0) >= 5) {
        return res.status(403).json({ error: 'Free plan limit reached (5 AI responses/month). Upgrade to Pro for unlimited responses.', upgrade_required: true });
      }
    }

    // Log this generation
    await db.asyncRun(
      'INSERT INTO ai_generations (id, user_id, review_id, model) VALUES (?, ?, ?, ?)',
      [generateId(), req.user.id, review.id, 'claude-sonnet-4-6']
    );

    const { tone = 'professional' } = req.body;
    const userRecord = await db.asyncGet('SELECT business_name, ai_persona FROM users WHERE id = ?', [req.user.id]);
    const businessName = userRecord?.business_name || req.user.business_name || 'our business';
    const persona = userRecord?.ai_persona || null;
    const response = await generateAIResponse(review, businessName, tone, persona);

    await db.asyncRun(`UPDATE reviews SET ai_response = ?, response_status = 'generated' WHERE id = ?`, [response, review.id]);

    res.json({ success: true, response });
  } catch (err) {
    console.error('Generate response error:', err);
    res.status(500).json({ error: 'Failed to generate response: ' + err.message });
  }
});

// Generate 3 response options for user to choose from
router.post('/:id/generate-options', authenticate, async (req, res) => {
  try {
    const review = await db.asyncGet('SELECT * FROM reviews WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    if (req.user.plan === 'free') {
      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const usedRow = await db.asyncGet(
        'SELECT COUNT(*) as total FROM ai_generations WHERE user_id = ? AND created_at >= ?',
        [req.user.id, monthStart.toISOString()]
      );
      if ((usedRow?.total || 0) >= 5) {
        return res.status(403).json({ error: 'Free plan limit reached (5 AI responses/month). Upgrade to Pro for unlimited responses.', upgrade_required: true });
      }
    }

    const { tone = 'professional' } = req.body;
    const userRecord = await db.asyncGet('SELECT business_name, ai_persona FROM users WHERE id = ?', [req.user.id]);
    const businessName = userRecord?.business_name || req.user.business_name || 'our business';
    const persona = userRecord?.ai_persona || null;

    const [opt1, opt2, opt3] = await Promise.all([
      generateAIResponse(review, businessName, tone, persona, 'concise'),
      generateAIResponse(review, businessName, tone, persona, 'detailed'),
      generateAIResponse(review, businessName, tone, persona, 'personal')
    ]);

    // Count as 1 generation event
    await db.asyncRun(
      'INSERT INTO ai_generations (id, user_id, review_id, model) VALUES (?, ?, ?, ?)',
      [generateId(), req.user.id, review.id, 'claude-sonnet-4-6']
    );

    res.json({ success: true, options: [opt1, opt2, opt3].filter(Boolean) });
  } catch (err) {
    console.error('Generate options error:', err);
    res.status(500).json({ error: 'Failed to generate options: ' + err.message });
  }
});

// Mark as responded
router.put('/:id/respond', authenticate, async (req, res) => {
  try {
    const { response_text } = req.body;
    const review = await db.asyncGet('SELECT * FROM reviews WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    await db.asyncRun(`UPDATE reviews SET response_status = 'responded', ai_response = ? WHERE id = ?`, [response_text || review.ai_response, review.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update review' });
  }
});

// Bulk generate AI responses (Pro/Business only)
router.post('/bulk-generate', authenticate, async (req, res) => {
  try {
    if (req.user.plan === 'free') {
      return res.status(403).json({ error: 'Bulk AI response generation requires a Pro or Business plan.', upgrade_required: true });
    }

    const { tone = 'professional' } = req.body;
    const userRecord = await db.asyncGet('SELECT business_name, ai_persona FROM users WHERE id = ?', [req.user.id]);
    const businessName = userRecord?.business_name || req.user.business_name || 'our business';
    const persona = userRecord?.ai_persona || null;

    const pending = await db.asyncAll(
      `SELECT * FROM reviews WHERE user_id = ? AND (ai_response IS NULL OR ai_response = '')`,
      [req.user.id]
    );

    if (!pending.length) {
      return res.json({ success: true, generated: 0, message: 'All reviews already have responses' });
    }

    let generated = 0;
    for (const review of pending.slice(0, 20)) {
      try {
        const response = await generateAIResponse(review, businessName, tone, persona);
        await db.asyncRun(
          `UPDATE reviews SET ai_response = ?, response_status = 'generated' WHERE id = ?`,
          [response, review.id]
        );
        await db.asyncRun(
          'INSERT INTO ai_generations (id, user_id, review_id, model) VALUES (?, ?, ?, ?)',
          [generateId(), req.user.id, review.id, 'claude-sonnet-4-6']
        );
        generated++;
      } catch (e) {
        console.error('Bulk generate error for review', review.id, e.message);
      }
    }

    res.json({ success: true, generated, message: `Generated responses for ${generated} of ${pending.length} pending reviews` });
  } catch (err) {
    console.error('Bulk generate error:', err);
    res.status(500).json({ error: 'Bulk generation failed: ' + err.message });
  }
});

// Delete all reviews — must be before /:id to avoid being swallowed as an id param
router.delete('/all', authenticate, async (req, res) => {
  try {
    await db.asyncRun('DELETE FROM reviews WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, message: 'All reviews deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete reviews' });
  }
});

// Delete review
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await db.asyncRun('DELETE FROM reviews WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

function analyzeSentiment(text, rating) {
  const positiveWords = ['excellent','amazing','great','fantastic','wonderful','outstanding','love','perfect','best','recommend','professional','friendly','helpful','awesome','brilliant'];
  const negativeWords = ['terrible','awful','horrible','worst','bad','poor','disappointed','rude','slow','never','waste','disgust','unacceptable','failed','broken','defective'];
  const lower = text.toLowerCase();
  const words = lower.split(/\W+/);
  const posScore = words.filter(w => positiveWords.includes(w)).length;
  const negScore = words.filter(w => negativeWords.includes(w)).length;
  const ratingScore = (rating - 3) * 0.2;
  const textScore = (posScore - negScore) * 0.1;
  const sentimentScore = Math.max(0.05, Math.min(0.99, 0.5 + ratingScore + textScore));
  const sentiment = sentimentScore >= 0.65 ? 'positive' : sentimentScore <= 0.40 ? 'negative' : 'neutral';
  const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','was','is','it','my','i','we','they','have','had','very','so','this','that']);
  const keywords = [...new Set(words.filter(w => w.length > 4 && !stopWords.has(w)))].slice(0, 6);
  return { sentiment, sentiment_score: sentimentScore, keywords };
}

async function generateAIResponse(review, businessName, tone, persona, style = 'balanced') {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return generateTemplateResponse(review, businessName);

  const toneMap = { professional: 'professional and courteous', friendly: 'warm and friendly', apologetic: 'empathetic and understanding', enthusiastic: 'enthusiastic and grateful' };
  const styleGuide = {
    concise: 'Keep it brief and punchy — 50-70 words max.',
    detailed: 'Be thorough and address each point the reviewer raised — 120-160 words.',
    personal: 'Be conversational and personal, as if speaking directly to them — 80-110 words.',
    balanced: 'Keep it 80-150 words, address specific points, and sign off naturally.'
  };
  const personaContext = persona ? `\n\nBrand voice guidelines: ${persona}` : '';

  const prompt = `You are a customer response specialist for ${businessName}. Write a ${toneMap[tone]||'professional'} response to this ${review.rating}-star review: "${review.review_text}". ${styleGuide[style]||styleGuide.balanced}${personaContext} Respond with ONLY the response text.`;

  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-sonnet-4-6',
    max_tokens: 350,
    messages: [{ role: 'user', content: prompt }]
  }, { headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } });

  return response.data.content[0]?.text;
}

function generateTemplateResponse(review, businessName) {
  if (review.rating >= 4) return `Thank you so much for your wonderful review! We're thrilled to hear you had such a positive experience at ${businessName}. Your kind words mean the world to our team and motivate us to keep delivering excellent service. We look forward to welcoming you back soon!`;
  if (review.rating === 3) return `Thank you for sharing your feedback. We're glad aspects of your visit met your expectations and appreciate your honest review. We're always working to improve and would love to make your next experience even better. Please don't hesitate to reach out to us directly.`;
  return `Thank you for your feedback. We sincerely apologize that your experience didn't meet the standards we hold ourselves to at ${businessName}. We take your concerns seriously and would appreciate the opportunity to make things right — please contact us directly so we can address this personally.`;
}

module.exports = router;
