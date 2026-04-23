const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const axios = require('axios');
const { sendEmail, newReviewEmail } = require('./email');

const YELP_API_KEY = process.env.YELP_API_KEY;

function requireProOrBusiness(req, res, next) {
  if (!['pro', 'business'].includes(req.user.plan)) {
    return res.status(403).json({ error: 'Yelp auto-sync requires a Pro or Business plan.', upgrade_required: true });
  }
  next();
}

// Search for a business on Yelp
router.get('/search', authenticate, requireProOrBusiness, async (req, res) => {
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

// Connect a business and do initial sync
router.post('/connect/:businessId', authenticate, requireProOrBusiness, async (req, res) => {
  try {
    if (!YELP_API_KEY) return res.status(500).json({ error: 'Yelp API not configured' });

    const { businessId } = req.params;
    const { business_name } = req.body;

    await db.asyncRun(
      'UPDATE users SET yelp_business_id = ?, yelp_business_name = ? WHERE id = ?',
      [businessId, business_name || businessId, req.user.id]
    );

    const count = await syncYelpReviews(req.user.id, businessId);

    res.json({
      success: true,
      synced: count,
      message: count > 0 ? `Connected and synced ${count} reviews from Yelp` : 'Business connected! No reviews found yet.'
    });
  } catch (err) {
    console.error('Yelp connect error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to connect Yelp: ' + err.message });
  }
});

// Manual re-sync
router.post('/sync', authenticate, requireProOrBusiness, async (req, res) => {
  try {
    const user = await db.asyncGet('SELECT yelp_business_id FROM users WHERE id = ?', [req.user.id]);
    if (!user?.yelp_business_id) return res.status(400).json({ error: 'No Yelp business connected' });

    const count = await syncYelpReviews(req.user.id, user.yelp_business_id);
    if (count > 0 && req.user.notify_new_reviews) {
      sendEmail({ to: req.user.email, subject: `You have ${count} new review(s) on ReplyPilot`, html: newReviewEmail(req.user.name, count, 'yelp') }).catch(() => {});
    }
    res.json({
      success: true,
      synced: count,
      message: count > 0 ? `Synced ${count} new review(s) from Yelp` : 'No new reviews since last sync'
    });
  } catch (err) {
    console.error('Yelp sync error:', err.message);
    res.status(500).json({ error: 'Failed to sync: ' + err.message });
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

// Makes up to 3 API calls (offsets 0, 3, 6) to get up to 9 reviews
async function syncYelpReviews(userId, businessId) {
  if (!YELP_API_KEY || !businessId) return 0;

  const offsets = [0, 3, 6];
  const allReviews = [];

  for (const offset of offsets) {
    try {
      const response = await axios.get(`https://api.yelp.com/v3/businesses/${businessId}/reviews`, {
        headers: { Authorization: `Bearer ${YELP_API_KEY}` },
        params: { limit: 3, offset, sort_by: 'yelp_sort' }
      });
      const batch = response.data.reviews || [];
      allReviews.push(...batch);
      // If Yelp returned fewer than 3, there are no more to fetch
      if (batch.length < 3) break;
    } catch (err) {
      // If offset pagination fails (Yelp may block it on free tier), stop here
      if (offset === 0) console.error('Yelp reviews fetch error:', err.response?.data || err.message);
      break;
    }
  }

  let count = 0;
  for (const yr of allReviews) {
    const existing = await db.asyncGet(
      'SELECT id FROM reviews WHERE yelp_review_id = ? AND user_id = ?',
      [yr.id, userId]
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
      [generateId(), userId, reviewerName, rating, reviewText, reviewDate,
       sentiment, sentiment_score, JSON.stringify(keywords), yr.id]
    );
    count++;
  }

  return count;
}

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
module.exports.syncYelpReviews = syncYelpReviews;
