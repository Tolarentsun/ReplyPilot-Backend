const express = require('express');
const axios = require('axios');
const { authMiddleware, requireSubscription } = require('../middleware/auth');
const { pool } = require('../db');

const router = express.Router();

// Google OAuth URL generation
router.get('/auth/url', authMiddleware, (req, res) => {
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${process.env.GOOGLE_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.GOOGLE_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('https://www.googleapis.com/auth/business.manage')}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${req.user.id}`;

  res.json({ url: authUrl });
});

// Google OAuth callback
router.get('/auth/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    
    if (!code || !userId) {
      return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=missing_params`);
    }

    // Exchange code for tokens
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Get user info
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const { email, name, picture } = userInfoResponse.data;

    // Save tokens and user info
    await pool.query(
      `INSERT INTO review_platforms 
       (user_id, platform, platform_id, access_token, refresh_token, metadata) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       ON CONFLICT (user_id, platform) 
       DO UPDATE SET 
         platform_id = EXCLUDED.platform_id,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      [
        userId,
        'google',
        email,
        access_token,
        refresh_token,
        JSON.stringify({ email, name, picture, expires_in })
      ]
    );

    res.redirect(`${process.env.FRONTEND_URL}/dashboard?connected=google`);
  } catch (error) {
    console.error('Google OAuth callback error:', error.response?.data || error.message);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=oauth_failed`);
  }
});

// Get user's Google Business accounts
router.get('/business/accounts', authMiddleware, requireSubscription, async (req, res) => {
  try {
    // Get user's Google access token
    const platformResult = await pool.query(
      'SELECT access_token FROM review_platforms WHERE user_id = $1 AND platform = $2',
      [req.user.id, 'google']
    );

    if (platformResult.rows.length === 0) {
      return res.status(401).json({ error: 'Google account not connected' });
    }

    const accessToken = platformResult.rows[0].access_token;

    // Get business accounts
    const response = await axios.get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const accounts = response.data.accounts || [];

    res.json({ accounts });
  } catch (error) {
    console.error('Get business accounts error:', error.response?.data || error.message);
    
    // Try to refresh token if expired
    if (error.response?.status === 401) {
      try {
        await refreshGoogleToken(req.user.id);
        // Retry the request
        return router.get('/business/accounts')(req, res);
      } catch (refreshError) {
        return res.status(401).json({ error: 'Google token expired, please reconnect' });
      }
    }

    res.status(500).json({ error: 'Failed to fetch business accounts' });
  }
});

// Get locations for a business account
router.get('/business/accounts/:accountId/locations', authMiddleware, requireSubscription, async (req, res) => {
  try {
    const { accountId } = req.params;
    
    const platformResult = await pool.query(
      'SELECT access_token FROM review_platforms WHERE user_id = $1 AND platform = $2',
      [req.user.id, 'google']
    );

    if (platformResult.rows.length === 0) {
      return res.status(401).json({ error: 'Google account not connected' });
    }

    const accessToken = platformResult.rows[0].access_token;

    // Get locations
    const response = await axios.get(
      `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          readMask: 'name,title,storeCode,metadata,profile,locationKey,labels,regularHours,serviceArea,adWordsLocationExtensions,latlng,openInfo,phoneNumbers,websiteUri,storefrontAddress,profile,serviceItems,specialHours,metadata,moreHours,locationState'
        }
      }
    );

    const locations = response.data.locations || [];

    res.json({ locations });
  } catch (error) {
    console.error('Get locations error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      try {
        await refreshGoogleToken(req.user.id);
        return router.get('/business/accounts/:accountId/locations')(req, res);
      } catch (refreshError) {
        return res.status(401).json({ error: 'Google token expired, please reconnect' });
      }
    }

    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// Get reviews for a location
router.get('/business/locations/:locationId/reviews', authMiddleware, requireSubscription, async (req, res) => {
  try {
    const { locationId } = req.params;
    
    const platformResult = await pool.query(
      'SELECT access_token FROM review_platforms WHERE user_id = $1 AND platform = $2',
      [req.user.id, 'google']
    );

    if (platformResult.rows.length === 0) {
      return res.status(401).json({ error: 'Google account not connected' });
    }

    const accessToken = platformResult.rows[0].access_token;

    // Get reviews
    const response = await axios.get(
      `https://mybusiness.googleapis.com/v4/${locationId}/reviews`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          pageSize: 50,
          orderBy: 'updateTime desc'
        }
      }
    );

    const reviews = response.data.reviews || [];

    // Save to database
    for (const review of reviews) {
      await pool.query(
        `INSERT INTO reviews 
         (user_id, platform, external_id, customer_name, rating, text, 
          business_name, business_location, review_date, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, platform, external_id) 
         DO UPDATE SET 
           rating = EXCLUDED.rating,
           text = EXCLUDED.text,
           status = EXCLUDED.status,
           updated_at = NOW()`,
        [
          req.user.id,
          'google',
          review.name,
          review.reviewer?.displayName || 'Anonymous',
          review.starRating,
          review.comment,
          review.location?.title || 'Unknown Business',
          review.location?.address || '',
          new Date(review.createTime),
          'new'
        ]
      );
    }

    // Get saved reviews from database
    const savedReviews = await pool.query(
      `SELECT r.*, 
              CASE 
                WHEN r.rating >= 4 THEN 'low'
                WHEN r.rating = 3 THEN 'medium'
                ELSE 'high'
              END as priority
       FROM reviews r
       WHERE r.user_id = $1 AND r.platform = $2
       ORDER BY r.review_date DESC
       LIMIT 100`,
      [req.user.id, 'google']
    );

    res.json({ reviews: savedReviews.rows });
  } catch (error) {
    console.error('Get reviews error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      try {
        await refreshGoogleToken(req.user.id);
        return router.get('/business/locations/:locationId/reviews')(req, res);
      } catch (refreshError) {
        return res.status(401).json({ error: 'Google token expired, please reconnect' });
      }
    }

    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Reply to a review
router.post('/business/reviews/:reviewId/reply', authMiddleware, requireSubscription, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { comment } = req.body;
    
    if (!comment || comment.trim().length < 5) {
      return res.status(400).json({ error: 'Comment must be at least 5 characters' });
    }

    const platformResult = await pool.query(
      'SELECT access_token FROM review_platforms WHERE user_id = $1 AND platform = $2',
      [req.user.id, 'google']
    );

    if (platformResult.rows.length === 0) {
      return res.status(401).json({ error: 'Google account not connected' });
    }

    const accessToken = platformResult.rows[0].access_token;

    // Post reply to Google
    const response = await axios.post(
      `https://mybusiness.googleapis.com/v4/${reviewId}/reply`,
      { comment: comment.trim() },
      {
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Update review status in database
    await pool.query(
      'UPDATE reviews SET status = $1, response_text = $2, response_date = NOW() WHERE external_id = $3 AND user_id = $4',
      ['published', comment.trim(), reviewId, req.user.id]
    );

    res.json({ success: true, reply: response.data });
  } catch (error) {
    console.error('Reply to review error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      try {
        await refreshGoogleToken(req.user.id);
        return router.post('/business/reviews/:reviewId/reply')(req, res);
      } catch (refreshError) {
        return res.status(401).json({ error: 'Google token expired, please reconnect' });
      }
    }

    res.status(500).json({ error: 'Failed to post reply' });
  }
});

// Helper function to refresh Google token
async function refreshGoogleToken(userId) {
  try {
    const platformResult = await pool.query(
      'SELECT refresh_token FROM review_platforms WHERE user_id = $1 AND platform = $2',
      [userId, 'google']
    );

    if (platformResult.rows.length === 0) {
      throw new Error('No refresh token found');
    }

    const refreshToken = platformResult.rows[0].refresh_token;

    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    const { access_token, expires_in } = response.data;

    await pool.query(
      'UPDATE review_platforms SET access_token = $1, updated_at = NOW() WHERE user_id = $2 AND platform = $3',
      [access_token, userId, 'google']
    );

    return access_token;
  } catch (error) {
    console.error('Refresh token error:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = router;