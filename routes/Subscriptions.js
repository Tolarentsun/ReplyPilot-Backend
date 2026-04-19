const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

// Get subscription plans
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    plans: [
      {
        id: 'free',
        name: 'Starter',
        price: 0,
        period: 'forever',
        features: [
          'Up to 25 reviews/month',
          'Basic sentiment analysis',
          'AI response generation (5/month)',
          'Email support'
        ],
        limits: { reviews: 25, ai_responses: 5 }
      },
      {
        id: 'pro',
        name: 'Professional',
        price: 49,
        period: 'month',
        popular: true,
        stripe_price_id: process.env.STRIPE_PRO_PRICE_ID,
        features: [
          'Unlimited reviews',
          'Advanced AI sentiment analysis',
          'Unlimited AI responses',
          'Competitor benchmarking',
          'Monthly insight reports',
          'Priority support'
        ],
        limits: { reviews: -1, ai_responses: -1 }
      },
      {
        id: 'business',
        name: 'Business',
        price: 149,
        period: 'month',
        stripe_price_id: process.env.STRIPE_BUSINESS_PRICE_ID,
        features: [
          'Everything in Professional',
          'Multi-location support',
          'White-label reports',
          'API access',
          'Custom response templates',
          'Dedicated account manager',
          'Google & Yelp integration'
        ],
        limits: { reviews: -1, ai_responses: -1 }
      }
    ]
  });
});

// Get current subscription
router.get('/current', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, plan, subscription_status, subscription_ends_at, stripe_subscription_id FROM users WHERE id = ?').get(req.user.id);
  res.json({ success: true, subscription: user });
});

// Create Stripe checkout session
router.post('/checkout', authenticate, async (req, res) => {
  try {
    const { plan_id } = req.body;
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeKey || stripeKey.startsWith('sk_test_...')) {
      // Demo mode - simulate subscription upgrade
      const validPlans = ['pro', 'business'];
      if (!validPlans.includes(plan_id)) {
        return res.status(400).json({ error: 'Invalid plan' });
      }

      db.prepare(`
        UPDATE users SET plan = ?, subscription_status = 'active', 
        subscription_ends_at = datetime('now', '+30 days'), updated_at = datetime('now')
        WHERE id = ?
      `).run(plan_id, req.user.id);

      return res.json({ 
        success: true, 
        demo_mode: true,
        message: `Successfully upgraded to ${plan_id} plan (demo mode - no charge)`,
        plan: plan_id
      });
    }

    const stripe = require('stripe')(stripeKey);
    const priceIdMap = {
      pro: process.env.STRIPE_PRO_PRICE_ID,
      business: process.env.STRIPE_BUSINESS_PRICE_ID
    };

    const priceId = priceIdMap[plan_id];
    if (!priceId) return res.status(400).json({ error: 'Invalid plan' });

    let customerId = req.user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.name
      });
      customerId = customer.id;
      db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, req.user.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/dashboard.html?upgraded=true`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing.html`,
      metadata: { user_id: req.user.id, plan_id }
    });

    res.json({ success: true, checkout_url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Stripe webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || stripeKey.startsWith('sk_test_...')) {
    return res.json({ received: true });
  }

  const stripe = require('stripe')(stripeKey);
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { user_id, plan_id } = session.metadata;
    db.prepare(`
      UPDATE users SET plan = ?, stripe_subscription_id = ?, subscription_status = 'active',
      subscription_ends_at = datetime('now', '+30 days'), updated_at = datetime('now')
      WHERE id = ?
    `).run(plan_id, session.subscription, user_id);
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    db.prepare(`
      UPDATE users SET plan = 'free', subscription_status = 'inactive', subscription_ends_at = NULL
      WHERE stripe_subscription_id = ?
    `).run(sub.id);
  }

  res.json({ received: true });
});

// Downgrade to free
router.post('/cancel', authenticate, async (req, res) => {
  try {
    db.prepare(`
      UPDATE users SET plan = 'free', subscription_status = 'inactive', 
      stripe_subscription_id = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(req.user.id);
    res.json({ success: true, message: 'Subscription cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

module.exports = router;
