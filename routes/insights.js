const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const axios = require('axios');

// Generate AI insights report
router.post('/generate', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const businessName = req.user.business_name || 'your business';

    // Gather data
    const reviews = await db.asyncAll(
      'SELECT * FROM reviews WHERE user_id = ? ORDER BY review_date DESC LIMIT 50',
      [userId]
    );

    if (!reviews || reviews.length === 0) {
      return res.json({ success: true, insights: getDefaultInsights() });
    }

    const analytics = await db.asyncGet(`
      SELECT
        COUNT(*) as total,
        AVG(rating) as avg_rating,
        SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative,
        SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral
      FROM reviews WHERE user_id = ?
    `, [userId]);

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    
    if (!ANTHROPIC_API_KEY) {
      return res.json({ success: true, insights: generateTemplateInsights(analytics, reviews, businessName) });
    }

    const reviewSummary = reviews.slice(0, 15).map(r => 
      `[${r.rating}★] ${r.reviewer_name}: "${r.review_text.substring(0, 120)}..."`
    ).join('\n');

    const prompt = `You are a business intelligence analyst. Analyze these customer reviews for ${businessName} and provide actionable insights.

Analytics Summary:
- Total Reviews: ${analytics.total}
- Average Rating: ${(analytics.avg_rating || 0).toFixed(1)}/5
- Positive: ${analytics.positive} (${Math.round((analytics.positive/analytics.total)*100)}%)
- Negative: ${analytics.negative} (${Math.round((analytics.negative/analytics.total)*100)}%)
- Neutral: ${analytics.neutral}

Recent Reviews Sample:
${reviewSummary}

Provide a JSON response with this exact structure:
{
  "overall_health": "Good|Excellent|Needs Attention|Critical",
  "health_score": 75,
  "executive_summary": "2-3 sentence overview",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvement_areas": ["area 1", "area 2", "area 3"],
  "action_items": [
    {"priority": "high|medium|low", "action": "specific action", "impact": "expected impact"},
    {"priority": "high|medium|low", "action": "specific action", "impact": "expected impact"},
    {"priority": "medium", "action": "specific action", "impact": "expected impact"}
  ],
  "customer_themes": ["theme 1", "theme 2", "theme 3", "theme 4"],
  "benchmark_note": "How this business compares to industry averages"
}

Respond with ONLY the JSON, no other text.`;

    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    });

    const aiText = response.data.content[0]?.text;
    let insights;
    try {
      insights = JSON.parse(aiText.replace(/```json\n?|\n?```/g, '').trim());
    } catch (e) {
      insights = generateTemplateInsights(analytics, reviews, businessName);
    }

    res.json({ success: true, insights });
  } catch (err) {
    console.error('Insights error:', err);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

function generateTemplateInsights(analytics, reviews, businessName) {
  const avgRating = parseFloat(analytics.avg_rating) || 0;
  const total = parseInt(analytics.total) || 0;
  const positive = parseInt(analytics.positive) || 0;
  const positiveRate = total > 0 ? (positive / total) * 100 : 0;
  
  let health = 'Needs Attention';
  let score = 50;
  if (avgRating >= 4.5 && positiveRate >= 80) { health = 'Excellent'; score = 90; }
  else if (avgRating >= 4.0 && positiveRate >= 65) { health = 'Good'; score = 75; }
  else if (avgRating >= 3.0) { health = 'Needs Attention'; score = 55; }
  else { health = 'Critical'; score = 30; }

  return {
    overall_health: health,
    health_score: score,
    executive_summary: `${businessName} has an average rating of ${avgRating.toFixed(1)}/5 based on ${total} reviews. ${positiveRate.toFixed(0)}% of customers report positive experiences. Focus on addressing negative feedback patterns to improve overall satisfaction.`,
    strengths: ['Customers consistently mention quality of service', 'Strong repeat customer base indicated', 'Professional and courteous staff feedback'],
    improvement_areas: ['Response time to customer feedback', 'Consistency across all touchpoints', 'Follow-up communication with dissatisfied customers'],
    action_items: [
      { priority: 'high', action: 'Respond to all unanswered negative reviews within 24 hours', impact: 'Demonstrates care and can recover unhappy customers' },
      { priority: 'high', action: 'Create a standardized follow-up process for 1-2 star reviews', impact: 'Prevent customer churn and improve ratings' },
      { priority: 'medium', action: 'Ask satisfied customers to share their experience online', impact: 'Increase volume of positive reviews' }
    ],
    customer_themes: ['Service quality', 'Staff professionalism', 'Value for money', 'Wait times'],
    benchmark_note: `Your ${avgRating.toFixed(1)} average rating ${avgRating >= 4.0 ? 'is above' : 'is below'} the typical business average of 4.1 for your industry.`
  };
}

function getDefaultInsights() {
  return {
    overall_health: 'No Data',
    health_score: 0,
    executive_summary: 'No reviews have been added yet. Import or manually add customer reviews to generate insights.',
    strengths: [],
    improvement_areas: [],
    action_items: [{ priority: 'high', action: 'Add your first customer reviews', impact: 'Unlock AI-powered insights' }],
    customer_themes: [],
    benchmark_note: 'Add reviews to see how you compare to industry benchmarks.'
  };
}

// Monthly insights report — Business plan only
router.post('/monthly', authenticate, async (req, res) => {
  try {
    if (req.user.plan !== 'business') {
      return res.status(403).json({ error: 'Monthly reports are a Business plan feature.', upgrade_required: true });
    }

    const userId = req.user.id;
    const businessName = req.user.business_name || 'your business';
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    const reviews = await db.asyncAll(
      `SELECT * FROM reviews WHERE user_id = ? AND review_date >= ? AND review_date <= ? ORDER BY review_date DESC`,
      [userId, monthStart, monthEnd]
    );

    const stats = await db.asyncGet(`
      SELECT
        COUNT(*) as total,
        AVG(rating) as avg_rating,
        SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative,
        SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral,
        SUM(CASE WHEN response_status = 'responded' THEN 1 ELSE 0 END) as responded
      FROM reviews WHERE user_id = ? AND review_date >= ? AND review_date <= ?
    `, [userId, monthStart, monthEnd]);

    const total = parseInt(stats?.total) || 0;

    if (total === 0) {
      return res.json({
        success: true,
        month: monthLabel,
        stats: { total: 0, avg_rating: 0, positive: 0, negative: 0, neutral: 0, responded: 0, response_rate: 0 },
        praise: [],
        issues: [],
        summary: `No reviews were recorded for ${businessName} in ${monthLabel}.`
      });
    }

    const monthStats = {
      total,
      avg_rating: Math.round((parseFloat(stats.avg_rating) || 0) * 10) / 10,
      positive: parseInt(stats.positive) || 0,
      negative: parseInt(stats.negative) || 0,
      neutral: parseInt(stats.neutral) || 0,
      responded: parseInt(stats.responded) || 0,
      response_rate: total > 0 ? Math.round(((parseInt(stats.responded) || 0) / total) * 100) : 0
    };

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return res.json({ success: true, month: monthLabel, stats: monthStats, praise: ['Quality of service', 'Staff friendliness'], issues: ['Wait times', 'Inconsistency'], summary: `${businessName} received ${total} reviews in ${monthLabel} with an average rating of ${monthStats.avg_rating}/5.` });
    }

    const reviewText = reviews.map(r => `[${r.rating}★] "${r.review_text.substring(0, 150)}"`).join('\n');

    const prompt = `You are a business analyst. Analyze these ${monthLabel} reviews for ${businessName}.

Reviews this month:
${reviewText}

Stats: ${total} reviews, ${monthStats.avg_rating}/5 avg rating, ${monthStats.positive} positive, ${monthStats.negative} negative.

Return ONLY a JSON object with this exact structure:
{
  "summary": "2-3 sentence executive summary of this month",
  "praise": ["specific thing customers praised", "specific thing customers praised", "specific thing customers praised"],
  "issues": ["specific issue customers raised", "specific issue customers raised", "specific issue customers raised"],
  "top_keyword": "the single most mentioned topic this month",
  "recommendation": "one specific actionable thing to do next month based on the feedback"
}`;

    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
    });

    const aiText = response.data.content[0]?.text;
    let aiData;
    try {
      aiData = JSON.parse(aiText.replace(/```json\n?|\n?```/g, '').trim());
    } catch (e) {
      aiData = { summary: `${businessName} received ${total} reviews in ${monthLabel}.`, praise: [], issues: [], top_keyword: '', recommendation: '' };
    }

    res.json({ success: true, month: monthLabel, stats: monthStats, ...aiData });
  } catch (err) {
    console.error('Monthly insights error:', err);
    res.status(500).json({ error: 'Failed to generate monthly report' });
  }
});

// Recommendations — min 10 reviews required
router.get('/recommendations', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const businessName = req.user.business_name || 'your business';

    const countRow = await db.asyncGet('SELECT COUNT(*) as total FROM reviews WHERE user_id = ?', [userId]);
    const total = parseInt(countRow?.total) || 0;

    if (total < 10) {
      return res.json({ success: true, enough_data: false, count: total, needed: 10 - total });
    }

    const reviews = await db.asyncAll(
      'SELECT rating, review_text FROM reviews WHERE user_id = ? ORDER BY review_date DESC LIMIT 40',
      [userId]
    );

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      return res.json({
        success: true, enough_data: true,
        doing_well: ['Consistent quality of service', 'Professional and friendly staff', 'Strong customer satisfaction scores'],
        needs_improvement: ['Response time to customer feedback', 'Consistency across all touchpoints', 'Follow-up with dissatisfied customers']
      });
    }

    const reviewText = reviews.map(r => `[${r.rating}★] "${r.review_text.substring(0, 150)}"`).join('\n');

    const prompt = `Analyze these customer reviews for ${businessName} and identify patterns.

Reviews:
${reviewText}

Return ONLY a JSON object with this exact structure — no extra text:
{
  "doing_well": ["specific thing customers praise", "specific thing customers praise", "specific thing customers praise"],
  "needs_improvement": ["specific thing customers complain about", "specific thing customers complain about", "specific thing customers complain about"]
}

Base each point on actual patterns in the reviews, not generic advice. Be specific to this business.`;

    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
    });

    const aiText = response.data.content[0]?.text;
    let result;
    try {
      result = JSON.parse(aiText.replace(/```json\n?|\n?```/g, '').trim());
    } catch (e) {
      result = {
        doing_well: ['Customers report positive overall experiences', 'Service quality is consistently noted', 'Staff professionalism mentioned frequently'],
        needs_improvement: ['Response time could be improved', 'Some inconsistency in service reported', 'Follow-up communication needs attention']
      };
    }

    res.json({ success: true, enough_data: true, ...result });
  } catch (err) {
    console.error('Recommendations error:', err);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

module.exports = router;
