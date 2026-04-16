const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { pool } = require('../db');

const router = express.Router();

// Get user profile (protected)
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT u.id, u.email, u.name, u.created_at,
              s.status as subscription_status, s.plan, s.current_period_end,
              s.stripe_customer_id, s.stripe_subscription_id
       FROM users u 
       LEFT JOIN subscriptions s ON u.id = s.user_id 
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.created_at,
        subscription: {
          status: user.subscription_status || 'trial',
          plan: user.plan || 'free',
          currentPeriodEnd: user.current_period_end,
          hasActiveSubscription: ['active', 'trialing'].includes(user.subscription_status)
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    
    const updateResult = await pool.query(
      'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name',
      [name, req.user.id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: updateResult.rows[0] });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get connected platforms
router.get('/platforms', authMiddleware, async (req, res) => {
  try {
    const platformsResult = await pool.query(
      'SELECT id, platform, platform_id, metadata, created_at FROM review_platforms WHERE user_id = $1',
      [req.user.id]
    );

    res.json({ platforms: platformsResult.rows });
  } catch (error) {
    console.error('Get platforms error:', error);
    res.status(500).json({ error: 'Failed to get platforms' });
  }
});

// Add connected platform
router.post('/platforms', authMiddleware, async (req, res) => {
  try {
    const { platform, platform_id, access_token, refresh_token, metadata } = req.body;
    
    if (!platform || !platform_id) {
      return res.status(400).json({ error: 'Platform and platform_id required' });
    }

    const platformResult = await pool.query(
      `INSERT INTO review_platforms 
       (user_id, platform, platform_id, access_token, refresh_token, metadata) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       ON CONFLICT (user_id, platform) 
       DO UPDATE SET 
         platform_id = EXCLUDED.platform_id,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()
       RETURNING id, platform, platform_id, metadata, created_at`,
      [req.user.id, platform, platform_id, access_token, refresh_token, metadata]
    );

    res.status(201).json({ platform: platformResult.rows[0] });
  } catch (error) {
    console.error('Add platform error:', error);
    res.status(500).json({ error: 'Failed to add platform' });
  }
});

// Remove connected platform
router.delete('/platforms/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const deleteResult = await pool.query(
      'DELETE FROM review_platforms WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    res.json({ message: 'Platform removed' });
  } catch (error) {
    console.error('Remove platform error:', error);
    res.status(500).json({ error: 'Failed to remove platform' });
  }
});

module.exports = router;