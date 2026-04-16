const express = require('express');
const Stripe = require('stripe');
const { authMiddleware } = require('../middleware/auth');
const { pool } = require('../db');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Get subscription status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const subscriptionResult = await pool.query(
      `SELECT status, plan, stripe_customer_id, stripe_subscription_id, 
              current_period_end, created_at
       FROM subscriptions 
       WHERE user_id = $1`,
      [req.user.id]
    );

    const subscription = subscriptionResult.rows[0] || {
      status: 'trial',
      plan: 'free',
      current_period_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    };

    // If user has Stripe subscription, get details
    let stripeSubscription = null;
    if (subscription.stripe_subscription_id) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(
          subscription.stripe_subscription_id
        );
      } catch (stripeError) {
        console.error('Stripe subscription fetch error:', stripeError);
      }
    }

    res.json({
      subscription: {
        status: subscription.status,
        plan: subscription.plan,
        currentPeriodEnd: subscription.current_period_end,
        hasActiveSubscription: ['active', 'trialing'].includes(subscription.status),
        stripe: stripeSubscription ? {
          id: stripeSubscription.id,
          status: stripeSubscription.status,
          currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
          cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end
        } : null
      }
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// Create checkout session for subscription
router.post('/checkout', authMiddleware, async (req, res) => {
  try {
    if (!process.env.STRIPE_PRICE_ID) {
      return res.status(500).json({ error: 'Stripe price ID not configured' });
    }

    // Get or create Stripe customer
    let customerId = req.user.subscription.stripeCustomerId;
    
    if (!customerId) {
      // Create new customer
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.name,
        metadata: { userId: req.user.id }
      });
      
      customerId = customer.id;
      
      // Save customer ID to database
      await pool.query(
        'UPDATE subscriptions SET stripe_customer_id = $1 WHERE user_id = $2',
        [customerId, req.user.id]
      );
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?canceled=true`,
      subscription_data: {
        metadata: { userId: req.user.id }
      }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Create portal session for subscription management
router.post('/portal', authMiddleware, async (req, res) => {
  try {
    const subscriptionResult = await pool.query(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1',
      [req.user.id]
    );

    if (!subscriptionResult.rows[0]?.stripe_customer_id) {
      return res.status(400).json({ error: 'No Stripe customer found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscriptionResult.rows[0].stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL}/dashboard`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Portal session error:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// Webhook handler for Stripe events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionEvent(event.data.object);
        break;
      
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

async function handleSubscriptionEvent(subscription) {
  const customerId = subscription.customer;
  const status = subscription.status;
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  const plan = subscription.items.data[0]?.price?.nickname || 'premium';

  // Find user by Stripe customer ID
  const userResult = await pool.query(
    'SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (userResult.rows.length > 0) {
    await pool.query(
      `UPDATE subscriptions 
       SET status = $1, plan = $2, current_period_end = $3, 
           stripe_subscription_id = $4, updated_at = NOW()
       WHERE user_id = $5`,
      [status, plan, currentPeriodEnd, subscription.id, userResult.rows[0].user_id]
    );
  }
}

async function handleCheckoutCompleted(session) {
  const subscriptionId = session.subscription;
  const customerId = session.customer;
  const userId = session.metadata?.userId;

  if (subscriptionId && customerId) {
    // Get subscription details
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    await pool.query(
      `UPDATE subscriptions 
       SET stripe_customer_id = $1, stripe_subscription_id = $2,
           status = $3, plan = $4, current_period_end = $5, updated_at = NOW()
       WHERE user_id = $6`,
      [
        customerId,
        subscriptionId,
        subscription.status,
        'premium',
        new Date(subscription.current_period_end * 1000),
        userId
      ]
    );
  }
}

module.exports = router;