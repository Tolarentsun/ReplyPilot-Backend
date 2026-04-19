const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

// Get all reviews for user with filtering
router.get('/', authenticate, (req, res) => {
  try {
    const { platform, sentiment, rating, page = 1, limit = 20, sort = 'newest' } = req.query;
    
    let query = 'SELECT * FROM reviews WHERE user_id = ?';
    const params = [req.user.id];

    if (platform && platform !== 'all') { query += ' AND platform = ?'; params.push(platform); }
    if (sentiment && sentiment !== 'all') { query += ' AND sentiment = ?'; params.push(sentiment); }
    if (rating && rating !== 'all') { query += ' AND rating = ?'; params.push(parseInt(rating)); }

    const sortMap = {
      newest: 'review_date DESC',
      oldest: 'review_date ASC',
      highest: 'rating DESC',
      lowest: 'rating ASC'
    };
    query += ` ORDER BY ${sortMap[sort] || 'review_date DESC'}`;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const reviews = db.prepare(query).all(...params);
    
    // Count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM reviews WHERE user_id = ?';
    const countParams = [req.user.id];
    if (platform && platform !== 'all') { countQuery += ' AND platform = ?'; countParams.push(platform); }
    if (sentiment && sentiment !== 'all') { countQuery += ' AND sentiment = ?'; countParams.push(sentiment); }
    if (rating && rating !== 'all') { countQuery += ' AND rating = ?'; countParams.push(parseInt(rating)); }
    
    const { total } = db.prepare(countQuery).get(...countParams);

    res.json({ 
      success: true, 
      reviews: reviews.map(r => ({
        ...r,
        keywords: r.keywords ? JSON.parse(r.keywords) : []
      })),
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (err) {
    console.error('Get reviews error:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Get analytics summary
router.get('/analytics', authenticate, (req, res) => {
  try {
    const userId = req.user.id;

    const totals = db.prepare(`
      SELECT 
        COUNT(*) as total_reviews,
        AVG(rating) as avg_rating,
        SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
        SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative_count,
        SUM(CASE WHEN response_status = 'responded' THEN 1 ELSE 0 END) as responded_count,
        SUM(CASE WHEN response_status = 'pending' THEN 1 ELSE 0 END) as pending_count
      FROM reviews WHERE user_id = ?
    `).get(userId);

    const ratingDist = db.prepare(`
      SELECT rating, COUNT(*) as count FROM reviews WHERE user_id = ? GROUP BY rating ORDER BY rating DESC
    `).all(userId);

    const platformDist = db.prepare(`
      SELECT platform, COUNT(*) as count, AVG(rating) as avg_rating FROM reviews WHERE user_id = ? GROUP BY platform
    `).all(userId);

    const monthlyTrend = db.prepare(`
      SELECT 
        strftime('%Y-%m', review_date) as month,
        COUNT(*) as count,
        AVG(rating) as avg_rating,
        SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive
      FROM reviews WHERE user_id = ?
      GROUP BY strftime('%Y-%m', review_date)
      ORDER BY month DESC
      LIMIT 12
    `).all(userId);

    // Aggregate keywords
    const allReviews = db.prepare('SELECT keywords FROM reviews WHERE user_id = ? AND keywords IS NOT NULL').all(userId);
    const keywordCounts = {};
    allReviews.forEach(r => {
      try {
        const keywords = JSON.parse(r.keywords);
        keywords.forEach(kw => {
          keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
        });
      } catch (e) {}
    });
    const topKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));

    const responseRate = totals.total_reviews > 0 
      ? Math.round((totals.responded_count / totals.total_reviews) * 100)
      : 0;

    res.json({
      success: true,
      analytics: {
        totals: {
          ...totals,
          avg_rating: Math.round((totals.avg_rating || 0) * 10) / 10,
          response_rate: responseRate
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

// Add a review manually
router.post('/', authenticate, (req, res) => {
  try {
    const { reviewer_name, rating, review_text, platform, review_date } = req.body;
    
    if (!reviewer_name || !rating || !review_text) {
      return res.status(400).json({ error: 'reviewer_name, rating, and review_text are required' });
    }

    // Simple sentiment analysis
    const { sentiment, sentiment_score, keywords } = analyzeSentiment(review_text, rating);

    const id = uuidv4();
    db.prepare(`
      INSERT INTO reviews (id, user_id, platform, reviewer_name, rating, review_text, review_date, sentiment, sentiment_score, keywords, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')
    `).run(
      id, req.user.id, platform || 'google', reviewer_name,
      parseInt(rating), review_text, review_date || new Date().toISOString().split('T')[0],
      sentiment, sentiment_score, JSON.stringify(keywords)
    );

    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
    res.json({ success: true, review: { ...review, keywords: JSON.parse(review.keywords || '[]') } });
  } catch (err) {
    console.error('Add review error:', err);
    res.status(500).json({ error: 'Failed to add review' });
  }
});

// Generate AI response for a review
router.post('/:id/generate-response', authenticate, async (req, res) => {
  try {
    const review = db.prepare('SELECT * FROM reviews WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    const { tone = 'professional', custom_instructions } = req.body;
    const businessName = req.user.business_name || 'our business';

    const response = await generateAIResponse(review, businessName, tone, custom_instructions, req.user.id);

    // Save the generated response
    db.prepare(`
      UPDATE reviews SET ai_response = ?, response_status = 'generated', updated_at = datetime('now')
      WHERE id = ?
    `).run(response, review.id);

    res.json({ success: true, response });
  } catch (err) {
    console.error('Generate response error:', err);
    res.status(500).json({ error: 'Failed to generate response: ' + err.message });
  }
});

// Mark as responded
router.put('/:id/respond', authenticate, (req, res) => {
  try {
    const { response_text } = req.body;
    const review = db.prepare('SELECT * FROM reviews WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    db.prepare(`
      UPDATE reviews SET response_status = 'responded', ai_response = ?, responded_at = datetime('now')
      WHERE id = ?
    `).run(response_text || review.ai_response, review.id);

    res.json({ success: true, message: 'Marked as responded' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update review' });
  }
});

// Delete review
router.delete('/:id', authenticate, (req, res) => {
  try {
    const review = db.prepare('SELECT * FROM reviews WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

// Helper: Simple sentiment analysis
function analyzeSentiment(text, rating) {
  const positiveWords = ['excellent', 'amazing', 'great', 'fantastic', 'wonderful', 'outstanding', 'love', 'perfect', 'best', 'recommend', 'professional', 'friendly', 'helpful', 'awesome', 'brilliant', 'superb', 'exceptional'];
  const negativeWords = ['terrible', 'awful', 'horrible', 'worst', 'bad', 'poor', 'disappointed', 'rude', 'slow', 'never', 'waste', 'disgust', 'unacceptable', 'failed', 'broken', 'defective'];

  const lower = text.toLowerCase();
  const words = lower.split(/\W+/);
  
  let posScore = words.filter(w => positiveWords.includes(w)).length;
  let negScore = words.filter(w => negativeWords.includes(w)).length;
  
  // Rating heavily influences sentiment
  const ratingScore = (rating - 3) * 0.2;
  const textScore = (posScore - negScore) * 0.1;
  const rawScore = 0.5 + ratingScore + textScore;
  const sentimentScore = Math.max(0.05, Math.min(0.99, rawScore));

  const sentiment = sentimentScore >= 0.65 ? 'positive' : sentimentScore <= 0.40 ? 'negative' : 'neutral';

  // Extract keywords (important words from review)
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'was', 'is', 'it', 'my', 'i', 'we', 'they', 'have', 'had', 'very', 'so', 'this', 'that', 'be', 'as', 'are', 'been']);
  const keywords = [...new Set(words.filter(w => w.length > 4 && !stopWords.has(w)))].slice(0, 6);

  return { sentiment, sentiment_score: sentimentScore, keywords };
}

// Helper: AI response generation via Anthropic API
async function generateAIResponse(review, businessName, tone, customInstructions, userId) {
  const axios = require('axios');
  
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    // Return a template response if no API key
    return generateTemplateResponse(review, businessName, tone);
  }

  const toneInstructions = {
    professional: 'Write in a professional, courteous business tone.',
    friendly: 'Write in a warm, friendly and approachable tone.',
    apologetic: 'Write in an empathetic, understanding tone that prioritizes the customer\'s feelings.',
    enthusiastic: 'Write with genuine enthusiasm and gratitude.'
  };

  const prompt = `You are a customer response specialist for ${businessName}. Generate a response to the following customer review.

Review Details:
- Reviewer: ${review.reviewer_name}
- Rating: ${review.rating}/5 stars
- Platform: ${review.platform}
- Review: "${review.review_text}"
- Sentiment: ${review.sentiment}

Instructions:
- ${toneInstructions[tone] || toneInstructions.professional}
- Keep response between 80-150 words
- Address specific points from the review
- If negative, acknowledge issues without making excuses and invite them to contact you directly
- If positive, thank them specifically and invite return
- Sign off naturally
- Do NOT use placeholders like [Name] or [Phone Number] - use generic phrases instead
${customInstructions ? `- Additional instructions: ${customInstructions}` : ''}

Respond with ONLY the response text, no preamble.`;

  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }]
  }, {
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    }
  });

  const aiText = response.data.content[0]?.text;
  
  // Log AI generation
  const { v4: uuidv4 } = require('uuid');
  try {
    db.prepare(`
      INSERT INTO ai_generations (id, user_id, review_id, prompt, response, model)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), userId, review.id, prompt, aiText, 'claude-sonnet-4-20250514');
  } catch (e) {}

  return aiText;
}

function generateTemplateResponse(review, businessName, tone) {
  const { rating, reviewer_name, review_text, sentiment } = review;
  
  if (rating >= 4) {
    return `Thank you so much for your wonderful review, ${reviewer_name}! We're thrilled to hear you had such a positive experience with ${businessName}. Your kind words mean the world to our team and motivate us to keep delivering the best possible service. We look forward to welcoming you back soon!`;
  } else if (rating === 3) {
    return `Thank you for taking the time to share your feedback, ${reviewer_name}. We appreciate your honest review and are glad aspects of your visit met your expectations. We're always working to improve and would love to learn more about how we can make your next experience even better. Please don't hesitate to reach out to us directly.`;
  } else {
    return `Thank you for your feedback, ${reviewer_name}. We sincerely apologize that your experience didn't meet the standards we hold ourselves to at ${businessName}. This is not the experience we want for our customers, and we take your concerns very seriously. We would appreciate the opportunity to make things right — please contact us directly so we can address your concerns personally.`;
  }
}

module.exports = router;
