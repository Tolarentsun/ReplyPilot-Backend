const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

router.get('/plans', (req, res) => {
  res.json({
    success: true,
    plans: [
      { id: 'free', name: 'Starter', price: 0, period: 'forever', features: ['Up to 25 reviews', 'Sentiment analysis', 'AI responses (5/month)', 'Basic analytics dashboard', 'Email support'], limits: { reviews: 25, ai_responses: 5 } },
      { id: 'pro', name: 'Professional', price: 49, period: 'month', popular: true, features: ['Unlimited reviews', 'Unlimited AI responses', 'Google auto-sync every 24 hours', 'Bulk generate all pending responses', 'Full trend analytics & AI insights', 'Priority support'], limits: { reviews: -1, ai_responses: -1 } },
      { id: 'business', name: 'Business', price: 149, period: 'month', features: ['Everything in Professional, plus:', '|DIVIDER|Business Exclusive', 'Post responses to Google in 1 click — no copy-paste ever', 'AI learns your brand voice and sign-off — every response sounds like you', 'Manage multiple Google locations from one account'], limits: { reviews: -1, ai_responses: -1 } }
    ]
  });
});

router.get('/current', authenticate, async (req, res) => {
  const user = await db.asyncGet('SELECT id, plan, subscription_status, subscription_ends_at FROM users WHERE id = ?', [req.user.id]);
  res.json({ success: true, subscription: user });
});

router.post('/checkout', authenticate, async (req, res) => {
  try {
    const { plan_id } = req.body;
    const validPlans = ['pro', 'business'];
    if (!validPlans.includes(plan_id)) return res.status(400).json({ error: 'Invalid plan' });

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey.startsWith('sk_test_...') || stripeKey.startsWith('mk_')) {
      // Demo mode
      await db.asyncRun(`UPDATE users SET plan = ?, subscription_status = 'active', subscription_ends_at = ? WHERE id = ?`,
        [plan_id, new Date(Date.now() + 30*24*60*60*1000).toISOString(), req.user.id]);
      return res.json({ success: true, demo_mode: true, message: `Successfully upgraded to ${plan_id} plan`, plan: plan_id });
    }

    const stripe = require('stripe')(stripeKey);
    const priceIdMap = {
      pro: process.env.STRIPE_PRO_PRICE_ID,
      business: process.env.STRIPE_BUSINESS_PRICE_ID
    };

    const priceId = priceIdMap[plan_id];
    if (!priceId) return res.status(400).json({ error: 'Invalid plan price ID' });

    let customerId = req.user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: req.user.email, name: req.user.name });
      customerId = customer.id;
      await db.asyncRun('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customerId, req.user.id]);
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://reply-pilot.net';
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/dashboard.html?upgraded=true`,
      cancel_url: `${frontendUrl}/dashboard.html`,
      metadata: { user_id: req.user.id, plan_id }
    });

    res.json({ success: true, checkout_url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session: ' + err.message });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || stripeKey.includes('...')) return res.json({ received: true });

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
    await db.asyncRun(`UPDATE users SET plan = ?, stripe_subscription_id = ?, subscription_status = 'active', subscription_ends_at = ? WHERE id = ?`,
      [plan_id, session.subscription, new Date(Date.now() + 30*24*60*60*1000).toISOString(), user_id]);
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    await db.asyncRun(`UPDATE users SET plan = 'free', subscription_status = 'inactive', subscription_ends_at = NULL WHERE stripe_subscription_id = ?`, [sub.id]);
  }

  res.json({ received: true });
});

router.post('/cancel', authenticate, async (req, res) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey && !stripeKey.includes('...') && req.user.stripe_subscription_id) {
      const stripe = require('stripe')(stripeKey);
      // Cancel at period end so user keeps access until billing cycle ends
      await stripe.subscriptions.update(req.user.stripe_subscription_id, {
        cancel_at_period_end: true
      });
    }
    await db.asyncRun(`UPDATE users SET subscription_status = 'cancelling' WHERE id = ?`, [req.user.id]);
    res.json({ success: true, message: 'Subscription cancelled. You will retain access until the end of your billing period.' });
  } catch (err) {
    console.error('Cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

router.post('/portal', authenticate, async (req, res) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey.includes('...')) {
      return res.json({ success: true, demo_mode: true, message: 'Billing portal not available in demo mode' });
    }

    const stripe = require('stripe')(stripeKey);
    const user = await db.asyncGet('SELECT * FROM users WHERE id = ?', [req.user.id]);

    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found. Please subscribe first.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://reply-pilot.net';
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${frontendUrl}/dashboard.html`,
    });

    res.json({ success: true, url: session.url });
  } catch (err) {
    console.error('Portal error:', err);
    res.status(500).json({ error: 'Failed to open billing portal: ' + err.message });
  }
});

module.exports = router;
