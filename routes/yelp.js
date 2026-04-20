const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const axios = require('axios');

const YELP_API_KEY = process.env.YELP_API_KEY;

// Search for a business on Yelp
router.get('/search', authenticate, async (req, res) => {
  try {
    if (!YELP_API_KEY) return res.status(500).json({ error: 'Yelp API not configured' });

    const { term, location } = req.query;
    if (!term || !location) return res.status(400).json({ error: 'Business name and location required' });

    const response = await axios.get('https://api.yelp.com/v3/businesses/search', {
      headers: { Authorization: `Bearer ${YELP_API_KEY}` },
      params: { term, location, limit: 5 }
    });

    const businesses = response.data.businesses.map(b => ({
      id: b.id,
      name: b.name,
      address: b.location?.display_address?.join(', '),
      rating: b.rating,
      review_count: b.review_count,
      image: b.image_url,
      url: b.url
    }));

    res.json({ success: true, businesses });
  } catch (err) {
    console.error('Yelp search error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to search Yelp: ' + err.message });
  }
});

// Get reviews for a business and sync to dashboard
router.post('/sync/:businessId', authenticate, async (req, res) => {
  try {
    if (!YELP_API_KEY) return res.status(500).json({ error: 'Yelp API not configured' });

    const { businessId } = req.params;
    const { business_name } = req.body;

    // Save yelp business ID to user
    await db.asyncRun(
      'UPDATE users SET yelp_business_id = ?, yelp_business_name = ? WHERE id = ?',
      [businessId, business_name || businessId, req.user.id]
    );

    // Get reviews from Yelp
    const response = await axios.get(`https://api.yelp.com/v3/businesses/${businessId}/reviews`, {
      headers: { Authorization: `Bearer ${YELP_API_KEY}` },
      params: { limit: 20, sort_by: 'yelp_sort' }
    });

    const reviews = response.data.reviews || [];
    let count = 0;

    for (const yr of reviews) {
      // Check if already imported
      const existing = await db.asyncGet(
        'SELECT id FROM reviews WHERE yelp_review_id = ? AND user_id = ?',
        [yr.id, req.user.id]
      );
      if (existing) continue;

      const rating = yr.rating || 3;
      const reviewText = yr.text || '(No comment provided)';
      const reviewDate = yr.time_created ? yr.time_created.split(' ')[0] : new Date().toISOString().split('T')[0];
      const reviewerName = yr.user?.name || 'Yelp Reviewer';

      const { sentiment, sentiment_score, keywords } = analyzeSentiment(reviewText, rating);

      await db.asyncRun(
        `INSERT INTO reviews (id, user_id, platform, reviewer_name, rating, review_text, review_date, sentiment, sentiment_score, keywords, source, yelp_review_id, response_status)
         VALUES (?, ?, 'yelp', ?, ?, ?, ?, ?, ?, ?, 'yelp_sync', ?, 'pending')`,
        [generateId(), req.user.id, reviewerName, rating, reviewText, reviewDate,
         sentiment, sentiment_score, JSON.stringify(keywords), yr.id]
      );
      count++;
    }

    res.json({
      success: true,
      synced: count,
      message: count > 0
        ? `Synced ${count} new reviews from Yelp`
        : 'No new reviews to sync (Yelp free API only provides 3 reviews per business)',
      note: 'Yelp free API provides up to 3 reviews. All responses must be posted manually on Yelp.'
    });
  } catch (err) {
    console.error('Yelp sync error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to sync Yelp reviews: ' + err.message });
  }
});

// Get Yelp connection status
router.get('/status', authenticate, async (req, res) => {
  const user = await db.asyncGet(
    'SELECT yelp_business_id, yelp_business_name FROM users WHERE id = ?',
    [req.user.id]
  );
  res.json({
    success: true,
    connected: !!user?.yelp_business_id,
    business_id: user?.yelp_business_id || null,
    business_name: user?.yelp_business_name || null
  });
});

// Disconnect Yelp
router.post('/disconnect', authenticate, async (req, res) => {
  await db.asyncRun(
    'UPDATE users SET yelp_business_id = NULL, yelp_business_name = NULL WHERE id = ?',
    [req.user.id]
  );
  res.json({ success: true });
});

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function analyzeSentiment(text, rating) {
  const positiveWords = ['excellent','amazing','great','fantastic','wonderful','outstanding','love','perfect','best','recommend','professional','friendly','helpful','awesome'];
  const negativeWords = ['terrible','awful','horrible','worst','bad','poor','disappointed','rude','slow','never','waste','defective'];
  const words = text.toLowerCase().split(/\W+/);
  const posScore = words.filter(w => positiveWords.includes(w)).length;
  const negScore = words.filter(w => negativeWords.includes(w)).length;
  const sentimentScore = Math.max(0.05, Math.min(0.99, 0.5 + (rating - 3) * 0.2 + (posScore - negScore) * 0.1));
  const sentiment = sentimentScore >= 0.65 ? 'positive' : sentimentScore <= 0.40 ? 'negative' : 'neutral';
  const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','was','is','it','my','i','we','they','have','had','very','so','this','that']);
  const keywords = [...new Set(words.filter(w => w.length > 4 && !stopWords.has(w)))].slice(0, 6);
  return { sentiment, sentiment_score: sentimentScore, keywords };
}

module.exports = router;
