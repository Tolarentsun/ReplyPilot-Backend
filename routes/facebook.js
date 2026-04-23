const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const axios = require('axios');
const { sendEmail, newReviewEmail } = require('./email');

const FB_APP_ID = process.env.FACEBOOK_APP_ID;
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI || 'https://reply-pilot.net/api/facebook/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://reply-pilot.net';
const FB_API = 'https://graph.facebook.com/v19.0';

// Step 1: Redirect user to Facebook OAuth
router.get('/connect', authenticate, (req, res) => {
  if (!FB_APP_ID) return res.status(500).json({ error: 'Facebook OAuth not configured' });

  const authUrl = 'https://www.facebook.com/v19.0/dialog/oauth?' +
    'client_id=' + FB_APP_ID + '&' +
    'redirect_uri=' + encodeURIComponent(REDIRECT_URI) + '&' +
    'scope=pages_show_list,pages_read_user_content&' +
    'state=' + req.user.id + '&' +
    'response_type=code';

  res.json({ success: true, auth_url: authUrl });
});

// Step 2: Handle OAuth callback
router.get('/callback', async (req, res) => {
  const { code, state: userId, error } = req.query;

  if (error) {
    return res.redirect(FRONTEND_URL + '/dashboard.html?fb_error=' + error);
  }

  if (!code || !userId) {
    return res.redirect(FRONTEND_URL + '/dashboard.html?fb_error=missing_params');
  }

  try {
    // Exchange code for short-lived user access token
    const tokenRes = await axios.get(FB_API + '/oauth/access_token', {
      params: {
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code
      }
    });

    const shortLivedToken = tokenRes.data.access_token;

    // Exchange for long-lived token (60 days)
    const longTokenRes = await axios.get(FB_API + '/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        fb_exchange_token: shortLivedToken
      }
    });

    const userToken = longTokenRes.data.access_token;

    // Get pages the user manages (page tokens derived from long-lived user token are permanent)
    const pagesRes = await axios.get(FB_API + '/me/accounts', {
      params: { access_token: userToken, fields: 'id,name,access_token' }
    });

    const pages = pagesRes.data.data || [];
    if (!pages.length) {
      return res.redirect(FRONTEND_URL + '/dashboard.html?fb_error=no_pages');
    }

    // Use the first page by default
    const page = pages[0];

    await db.asyncRun(
      'UPDATE users SET facebook_connected = true, facebook_access_token = ?, facebook_page_id = ?, facebook_page_name = ? WHERE id = ?',
      [page.access_token, page.id, page.name, userId]
    );

    // Auto-sync reviews on connect
    await syncFacebookReviews(userId, page.access_token, page.id);

    res.redirect(FRONTEND_URL + '/dashboard.html?facebook_connected=true');
  } catch (err) {
    console.error('Facebook callback error:', err.response?.data || err.message);
    res.redirect(FRONTEND_URL + '/dashboard.html?fb_error=auth_failed');
  }
});

// Get connection status
router.get('/status', authenticate, async (req, res) => {
  const user = await db.asyncGet(
    'SELECT facebook_connected, facebook_page_id, facebook_page_name FROM users WHERE id = ?',
    [req.user.id]
  );
  res.json({
    success: true,
    connected: user?.facebook_connected || false,
    page_id: user?.facebook_page_id || null,
    page_name: user?.facebook_page_name || null
  });
});

// Manually sync Facebook reviews
router.post('/sync', authenticate, async (req, res) => {
  try {
    const user = await db.asyncGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user.facebook_connected || !user.facebook_access_token) {
      return res.status(400).json({ error: 'Facebook not connected' });
    }

    const count = await syncFacebookReviews(user.id, user.facebook_access_token, user.facebook_page_id);
    if (count > 0 && user.notify_new_reviews) {
      sendEmail({ to: user.email, subject: `You have ${count} new review(s) on ReplyPilot`, html: newReviewEmail(user.name, count, 'facebook') }).catch(() => {});
    }
    res.json({
      success: true,
      synced: count,
      message: 'Synced ' + count + ' new review(s) from Facebook',
      note: 'Facebook reviews must be responded to manually on your Facebook Page — the API does not support posting replies.'
    });
  } catch (err) {
    console.error('Facebook sync error:', err.message);
    res.status(500).json({ error: 'Failed to sync reviews: ' + err.message });
  }
});

// Disconnect Facebook
router.post('/disconnect', authenticate, async (req, res) => {
  try {
    await db.asyncRun(
      'UPDATE users SET facebook_connected = false, facebook_access_token = NULL, facebook_page_id = NULL, facebook_page_name = NULL WHERE id = ?',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect Facebook' });
  }
});

// Helper: sync reviews from a Facebook Page
async function syncFacebookReviews(userId, pageToken, pageId) {
  if (!pageId || !pageToken) return 0;

  try {
    const ratingsRes = await axios.get(FB_API + '/' + pageId + '/ratings', {
      params: {
        access_token: pageToken,
        fields: 'reviewer,rating,recommendation_type,review_text,created_time',
        limit: 50
      }
    });

    const ratings = ratingsRes.data.data || [];
    let count = 0;

    for (const fb of ratings) {
      const fbReviewId = pageId + '_' + (fb.reviewer?.id || fb.created_time);

      const existing = await db.asyncGet(
        'SELECT id FROM reviews WHERE facebook_review_id = ? AND user_id = ?',
        [fbReviewId, userId]
      );
      if (existing) continue;

      // Facebook uses 1-5 star ratings on older pages; newer pages use recommendation_type (positive/negative)
      let rating = fb.rating || null;
      if (!rating) {
        rating = fb.recommendation_type === 'positive' ? 5 : 1;
      }

      const reviewText = fb.review_text || '(No comment provided)';
      const reviewDate = fb.created_time
        ? fb.created_time.split('T')[0]
        : new Date().toISOString().split('T')[0];
      const reviewerName = fb.reviewer?.name || 'Facebook Reviewer';

      const { sentiment, sentiment_score, keywords } = analyzeSentiment(reviewText, rating);

      await db.asyncRun(
        'INSERT INTO reviews (id, user_id, platform, reviewer_name, rating, review_text, review_date, sentiment, sentiment_score, keywords, source, facebook_review_id, response_status) VALUES (?, ?, \'facebook\', ?, ?, ?, ?, ?, ?, ?, \'facebook_sync\', ?, \'pending\')',
        [generateId(), userId, reviewerName, rating, reviewText, reviewDate, sentiment, sentiment_score, JSON.stringify(keywords), fbReviewId]
      );
      count++;
    }

    return count;
  } catch (err) {
    console.error('Facebook ratings fetch error:', err.response?.data || err.message);
    return 0;
  }
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
