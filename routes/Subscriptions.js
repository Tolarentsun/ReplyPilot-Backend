const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

router.get('/plans', (req, res) => {
  res.json({
    success: true,
    plans: [
      {
        id: 'free',
        name: 'Starter',
        price: 0,
        period: 'forever',
        features: ['Up to 25 reviews/month', 'Basic sentiment analysis', 'AI response generation (5/month)', 'Email support'],
        limits: { reviews: 25, ai_responses: 5 }
      },
      {
        id: 'pro',
        name: 'Professional',
        price: 49,
        period: 'month',
        popular: true,
        features: ['Unlimited reviews', 'Advanced AI sentiment analysis', 'Unlimited AI responses', 'Competitor benchmarking', 'Monthly insight reports', 'Priority support'],
        limits: { reviews: -1, ai_responses: -1 }
      },
      {
        id: 'business',
        name: 'Business',
        price: 149,
        period: 'month',
        features: ['Everything in Professional', 'Multi-location support', 'White-label reports', 'API access', 'Custom response templates', 'Dedicated account manager'],
        limits: { reviews: -1, ai_responses: -1 }
      }
    ]
  });
});

router.get('/current', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, plan, subscription_status, subscription_ends_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ success: true, subscription: user });
});

router.post('/checkout', authenticate, async (req, res) => {
  try {
    const { plan_id } = req.body;
    const validPlans = ['pro', 'business'];
    if (!validPlans.includes(plan_id)) return res.status(400).json({ error: 'Invalid plan' });

    db.prepare(`UPDATE users SET plan = ?, subscription_status = 'active', subscription_ends_at = ? WHERE id = ?`)
      .run(plan_id, new Date(Date.now() + 30*24*60*60*1000).toISOString(), req.user.id);

    res.json({ success: true, demo_mode: true, message: `Successfully upgraded to ${plan_id} plan`, plan: plan_id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process upgrade' });
  }
});

router.post('/cancel', authenticate, (req, res) => {
  try {
    db.prepare(`UPDATE users SET plan = 'free', subscription_status = 'inactive' WHERE id = ?`).run(req.user.id);
    res.json({ success: true, message: 'Subscription cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

module.exports = router;
