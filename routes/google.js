const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const axios = require('axios');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://replypilot-backend-production.up.railway.app/api/google/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://tolarentsun.github.io/ReplyPilot-Backend';

// Step 1: Redirect user to Google OAuth
router.get('/connect', authenticate, (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'Google OAuth not configured' });
  }

  const scopes = [
    'https://www.googleapis.com/auth/business.manage',
    'https://www.googleapis.com/auth/userinfo.email'
  ].join(' ');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `access_type=offline&` +
    `prompt=consent&` +
    `state=${req.user.id}`;

  res.json({ success: true, auth_url: authUrl });
});

// Step 2: Handle OAuth callback
router.get('/callback', async (req, res) => {
  const { code, state: userId, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND_URL}/dashboard.html?google_error=${error}`);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const { access_token, refresh_token } = tokenRes.data;

    // Save tokens to user
    await db.asyncRun(
      'UPDATE users SET google_access_token = ?, google_refresh_token = ?, google_connected = true WHERE id = ?',
      [access_token, refresh_token || null, userId]
    );

    // Fetch their business accounts
    await syncGoogleReviews(userId, access_token);

    res.redirect(`${FRONTEND_URL}/dashboard.html?google_connected=true`);
  } catch (err) {
    console.error('Google callback error:', err.message);
    res.redirect(`${FRONTEND_URL}/dashboard.html?google_error=auth_failed`);
  }
});

// Get Google connection status
router.get('/status', authenticate, async (req, res) => {
  const user = await db.asyncGet('SELECT google_connected, google_business_name, google_location_id FROM users WHERE id = ?', [req.user.id]);
  res.json({
    success: true,
    connected: user?.google_connected || false,
    business_name: user?.google_business_name || null,
    location_id: user?.google_location_id || null
  });
});

// Disconnect Google
router.post('/disconnect', authenticate, async (req, res) => {
  try {
    await db.asyncRun(
      'UPDATE users SET google_access_token = NULL, google_refresh_token = NULL, google_connected = false, google_location_id = NULL WHERE id = ?',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect Google' });
  }
});

// Manually sync Google reviews
router.post('/sync', authenticate, async (req, res) => {
  try {
    const user = await db.asyncGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user.google_connected || !user.google_access_token) {
      return res.status(400).json({ error: 'Google not connected' });
    }

    const token = await refreshTokenIfNeeded(user);
    const count = await syncGoogleReviews(user.id, token, user.google_location_id);
    res.json({ success: true, synced: count, message: `Synced ${count} reviews from Google` });
  } catch (err) {
    console.error('Sync error:', err.message);
    res.status(500).json({ error: 'Failed to sync reviews: ' + err.message });
  }
});

// Post a response to Google
router.post('/respond/:reviewId', authenticate, async (req, res) => {
  try {
    const { response_text } = req.body;
    const review = await db.asyncGet('SELECT * FROM reviews WHERE id = ? AND user_id = ?', [req.params.reviewId, req.user.id]);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (!review.google_review_id) return res.status(400).json({ error: 'This review is not from Google' });

    const user = await db.asyncGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user.google_connected) return res.status(400).json({ error: 'Google not connected' });

    const token = await refreshTokenIfNeeded(user);

    // Post reply to Google Business Profile API
    await axios.put(
      `https://mybusiness.googleapis.com/v4/${review.google_review_id}/reply`,
      { comment: response_text },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Mark as responded in DB
    await db.asyncRun(
      `UPDATE reviews SET response_status = 'responded', ai_response = ?, responded_at = ? WHERE id = ?`,
      [response_text, new Date().toISOString(), review.id]
    );

    res.json({ success: true, message: 'Response posted to Google!' });
  } catch (err) {
    console.error('Post response error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to post response: ' + (err.response?.data?.error?.message || err.message) });
  }
});

// Get business locations
router.get('/locations', authenticate, async (req, res) => {
  try {
    const user = await db.asyncGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user.google_connected) return res.status(400).json({ error: 'Google not connected' });

    const token = await refreshTokenIfNeeded(user);
    const accountsRes = await axios.get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const accounts = accountsRes.data.accounts || [];
    const locations = [];

    for (const account of accounts.slice(0, 3)) {
      try {
        const locRes = await axios.get(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (locRes.data.locations) {
          locations.push(...locRes.data.locations.map(l => ({
            id: l.name,
            name: l.title,
            account: account.name
          })));
        }
      } catch (e) {}
    }

    res.json({ success: true, locations });
  } catch (err) {
    console.error('Locations error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// Set active location
router.post('/location', authenticate, async (req, res) => {
  try {
    const { location_id, business_name } = req.body;
    await db.asyncRun(
      'UPDATE users SET google_location_id = ?, google_business_name = ? WHERE id = ?',
      [location_id, business_name, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set location' });
  }
});

// Helper: refresh token if expired
async function refreshTokenIfNeeded(user) {
  if (!user.google_refresh_token) return user.google_access_token;
  try {
    const res = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: user.google_refresh_token,
      grant_type: 'refresh_token'
    });
    const newToken = res.data.access_token;
    await db.asyncRun('UPDATE users SET google_access_token = ? WHERE id = ?', [newToken, user.id]);
    return newToken;
  } catch (e) {
    return user.google_access_token;
  }
}

// Helper: sync reviews from Google
async function syncGoogleReviews(userId, token, locationId) {
  if (!locationId) {
    // Try to get first location
    try {
      const accountsRes = await axios.get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const accounts = accountsRes.data.accounts || [];
      if (!accounts.length) return 0;

      const locRes = await axios.get(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${accounts[0].name}/locations?readMask=name,title`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const locs = locRes.data.locations || [];
      if (!locs.length) return 0;
      locationId = locs[0].name;

      await db.asyncRun('UPDATE users SET google_location_id = ?, google_business_name = ? WHERE id = ?',
        [locationId, locs[0].title, userId]);
    } catch (e) {
      console.error('Failed to get location:', e.message);
      return 0;
    }
  }

  try {
    const reviewsRes = await axios.get(
      `https://mybusiness.googleapis.com/v4/${locationId}/reviews`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const reviews = reviewsRes.data.reviews || [];
    let count = 0;

    for (const gr of reviews) {
      // Check if already imported
      const existing = await db.asyncGet('SELECT id FROM reviews WHERE google_review_id = ? AND user_id = ?',
        [gr.reviewId, userId]);
      if (existing) continue;

      const rating = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[gr.starRating] || 3;
      const reviewText = gr.comment || '(No comment provided)';
      const reviewDate = gr.createTime ? gr.createTime.split('T')[0] : new Date().toISOString().split('T')[0];
      const reviewerName = gr.reviewer?.displayName || 'Google Reviewer';

      const { sentiment, sentiment_score, keywords } = analyzeSentiment(reviewText, rating);

      await db.asyncRun(
        `INSERT INTO reviews (id, user_id, platform, reviewer_name, rating, review_text, review_date, sentiment, sentiment_score, keywords, source, google_review_id, response_status) VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?, ?, 'google_sync', ?, ?)`,
        [generateId(), userId, reviewerName, rating, reviewText, reviewDate, sentiment, sentiment_score,
         JSON.stringify(keywords), gr.reviewId, gr.reviewReply ? 'responded' : 'pending']
      );
      count++;
    }
    return count;
  } catch (err) {
    console.error('Sync reviews error:', err.response?.data || err.message);
    return 0;
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function analyzeSentiment(text, rating) {
  const positiveWords = ['excellent','amazing','great','fantastic','wonderful','outstanding','love','perfect','best','recommend','professional','friendly','helpful','awesome'];
  const negativeWords = ['terrible','awful','horrible','worst','bad','poor','disappointed','rude','slow','never','waste','defective'];
  const lower = text.toLowerCase();
  const words = lower.split(/\W+/);
  const posScore = words.filter(w => positiveWords.includes(w)).length;
  const negScore = words.filter(w => negativeWords.includes(w)).length;
  const sentimentScore = Math.max(0.05, Math.min(0.99, 0.5 + (rating - 3) * 0.2 + (posScore - negScore) * 0.1));
  const sentiment = sentimentScore >= 0.65 ? 'positive' : sentimentScore <= 0.40 ? 'negative' : 'neutral';
  const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','was','is','it','my','i','we','they','have','had','very','so','this','that']);
  const keywords = [...new Set(words.filter(w => w.length > 4 && !stopWords.has(w)))].slice(0, 6);
  return { sentiment, sentiment_score: sentimentScore, keywords };
}

module.exports = router;
module.exports.syncGoogleReviews = syncGoogleReviews;
module.exports.refreshTokenIfNeeded = refreshTokenIfNeeded;
