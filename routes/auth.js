const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { seedDemoReviews } = require('../db/seedData');
const { sendEmail, welcomeEmail, passwordResetEmail, verifyEmailTemplate } = require('./email');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is not set');


// Common email domain typos that will cause bounces
const EMAIL_TYPOS = {
  'icioud.com': 'icloud.com', 'icoud.com': 'icloud.com', 'iclod.com': 'icloud.com',
  'iclould.com': 'icloud.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com', 'gmali.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'outlok.com': 'outlook.com', 'outook.com': 'outlook.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com',
};

function checkEmailTypo(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? EMAIL_TYPOS[domain] || null : null;
}

function extractSignupSource(req) {
  const { utm_source, utm_medium, utm_campaign } = req.body;
  const referrer = req.headers['referer'] || req.headers['referrer'] || null;
  if (!utm_source && !utm_medium && !utm_campaign && !referrer) return null;
  return JSON.stringify({ utm_source: utm_source || null, utm_medium: utm_medium || null, utm_campaign: utm_campaign || null, referrer: referrer || null });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, business_name, business_type, ref } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const typoCorrection = checkEmailTypo(email);
    if (typoCorrection) {
      const suggested = email.replace(/@.+$/, '@' + typoCorrection);
      return res.status(400).json({ error: `Your email domain looks like a typo. Did you mean ${suggested}?`, typo: true, suggested });
    }

    const existing = await db.asyncGet('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const id = generateId();
    const passwordHash = await bcrypt.hash(password, 12);

    // Validate referrer before inserting so we don't credit a fake ID
    let validRef = null;
    if (ref && ref !== id) {
      const referrer = await db.asyncGet('SELECT id FROM users WHERE id = ?', [ref]);
      if (referrer) validRef = ref;
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const signupSource = extractSignupSource(req);

    await db.asyncRun(
      `INSERT INTO users (id, name, email, password_hash, business_name, business_type, plan, referred_by, email_verified, email_verify_token, email_verify_expires, signup_source) VALUES (?, ?, ?, ?, ?, ?, 'free', ?, false, ?, ?, ?)`,
      [id, name, email.toLowerCase(), passwordHash, business_name || null, business_type || null, validRef, verifyToken, verifyExpires, signupSource]
    );

    // Credit referrer: +15 bonus reviews and +15 bonus AI responses
    if (validRef) {
      await db.asyncRun(
        `UPDATE users SET referral_count = referral_count + 1, referral_bonus_reviews = referral_bonus_reviews + 15, referral_bonus_responses = referral_bonus_responses + 15 WHERE id = ?`,
        [validRef]
      );
    }

    await seedDemoReviews(id);

    sendEmail({ to: email, subject: 'Verify your ReplyPilot email', html: verifyEmailTemplate(name, verifyToken) }).catch(() => {});
    sendEmail({
      to: 'Christophersw1011@gmail.com',
      subject: `New ReplyPilot signup: ${name}`,
      html: `<p>New user signed up on ReplyPilot.</p><ul><li><strong>Name:</strong> ${name}</li><li><strong>Email:</strong> ${email}</li><li><strong>Plan:</strong> Free</li><li><strong>Source:</strong> ${signupSource || 'direct'}</li><li><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</li></ul>`
    }).catch(() => {});

    res.json({ success: true, verify: true, message: 'Account created! Please check your email to verify your account.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = await db.asyncGet('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    if (!user.email_verified) {
      return res.status(403).json({ error: 'Please verify your email before logging in. Check your inbox for the verification link.', unverified: true, email: user.email });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    const { password_hash, ...safeUser } = user;

    res.json({ success: true, token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

router.get('/me', authenticate, async (req, res) => {
  const fresh = await db.asyncGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!fresh) return res.status(404).json({ error: 'User not found' });
  const { password_hash, reset_token, reset_token_expires, ...safeUser } = fresh;
  res.json({ success: true, user: safeUser });
});

router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, business_name, business_type, ai_persona } = req.body;
    await db.asyncRun(
      `UPDATE users SET name = ?, business_name = ?, business_type = ?, ai_persona = ? WHERE id = ?`,
      [name || req.user.name, business_name || null, business_type || null, ai_persona !== undefined ? ai_persona : req.user.ai_persona, req.user.id]
    );
    const updated = await db.asyncGet('SELECT id, name, email, plan, business_name, business_type, ai_persona FROM users WHERE id = ?', [req.user.id]);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ error: 'Profile update failed' });
  }
});

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords are required' });
    if (new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const valid = await bcrypt.compare(current_password, req.user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(new_password, 12);
    await db.asyncRun('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await db.asyncGet('SELECT id, name, email FROM users WHERE email = ?', [email.toLowerCase()]);

    // Always respond success to prevent email enumeration
    if (!user) return res.json({ success: true });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await db.asyncRun('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [token, expires, user.id]);

    await sendEmail({ to: user.email, subject: 'Reset your ReplyPilot password', html: passwordResetEmail(user.name, token) });

    res.json({ success: true });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to send reset email' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const user = await db.asyncGet(
      'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > ?',
      [token, new Date().toISOString()]
    );

    if (!user) return res.status(400).json({ error: 'This reset link has expired or is invalid. Please request a new one.' });

    const hash = await bcrypt.hash(password, 12);
    await db.asyncRun('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [hash, user.id]);

    res.json({ success: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Verify email via token link
router.get('/verify-email', async (req, res) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://reply-pilot.net';
  const { token } = req.query;
  if (!token) return res.redirect(`${FRONTEND_URL}/login.html?error=invalid_token`);
  try {
    const user = await db.asyncGet(
      'SELECT id, name FROM users WHERE email_verify_token = ? AND email_verify_expires > ?',
      [token, new Date().toISOString()]
    );
    if (!user) return res.redirect(`${FRONTEND_URL}/verify-email?error=expired`);
    await db.asyncRun(
      'UPDATE users SET email_verified = true, email_verify_token = NULL, email_verify_expires = NULL WHERE id = ?',
      [user.id]
    );
    const jwt_token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.redirect(`${FRONTEND_URL}/dashboard.html?token=${jwt_token}&verified=true`);
  } catch (err) {
    console.error('Verify email error:', err.message);
    res.redirect(`${FRONTEND_URL}/verify-email?error=failed`);
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const user = await db.asyncGet('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) return res.json({ success: true }); // don't reveal if email exists
    if (user.email_verified) return res.json({ success: true, message: 'Already verified' });
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.asyncRun(
      'UPDATE users SET email_verify_token = ?, email_verify_expires = ? WHERE id = ?',
      [verifyToken, verifyExpires, user.id]
    );
    await sendEmail({ to: user.email, subject: 'Verify your ReplyPilot email', html: verifyEmailTemplate(user.name, verifyToken) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// Google OAuth login/signup
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'Google login not configured' });
  const ref = req.query.ref || '';
  const utm_source = req.query.utm_source || '';
  const utm_medium = req.query.utm_medium || '';
  const utm_campaign = req.query.utm_campaign || '';
  const referrer = req.headers['referer'] || req.headers['referrer'] || '';
  const state = Buffer.from(JSON.stringify({ ref, utm_source, utm_medium, utm_campaign, referrer })).toString('base64');
  const redirect = encodeURIComponent(`${process.env.FRONTEND_URL || 'https://reply-pilot.net'}/api/auth/google/callback`);
  const scope = encodeURIComponent('openid email profile');
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirect}&response_type=code&scope=${scope}&state=${state}`);
});

router.get('/google/callback', async (req, res) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://reply-pilot.net';
  const { code, state, error } = req.query;
  if (error || !code) return res.redirect(`${FRONTEND_URL}/login.html?error=google_cancelled`);

  try {
    const redirectUri = `${FRONTEND_URL}/api/auth/google/callback`;
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    const { access_token } = tokenRes.data;
    const profileRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const { email, name, sub: googleId } = profileRes.data;
    if (!email) return res.redirect(`${FRONTEND_URL}/login.html?error=google_no_email`);

    let ref = null, utm_source = null, utm_medium = null, utm_campaign = null, referrer = null;
    try {
      const parsed = JSON.parse(Buffer.from(state, 'base64').toString());
      ref = parsed.ref || null;
      utm_source = parsed.utm_source || null;
      utm_medium = parsed.utm_medium || null;
      utm_campaign = parsed.utm_campaign || null;
      referrer = parsed.referrer || null;
    } catch {}

    let user = await db.asyncGet('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    let isNew = false;

    if (!user) {
      // New user — create account
      const id = generateId();
      let validRef = null;
      if (ref && ref !== id) {
        const referrer_user = await db.asyncGet('SELECT id FROM users WHERE id = ?', [ref]);
        if (referrer_user) validRef = ref;
      }
      const signupSource = (utm_source || utm_medium || utm_campaign || referrer)
        ? JSON.stringify({ utm_source, utm_medium, utm_campaign, referrer })
        : null;
      await db.asyncRun(
        `INSERT INTO users (id, name, email, password_hash, plan, referred_by, email_verified, signup_source) VALUES (?, ?, ?, '', 'free', ?, true, ?)`,
        [id, name, email.toLowerCase(), validRef, signupSource]
      );
      if (validRef) {
        await db.asyncRun(
          `UPDATE users SET referral_count = referral_count + 1, referral_bonus_reviews = referral_bonus_reviews + 15, referral_bonus_responses = referral_bonus_responses + 15 WHERE id = ?`,
          [validRef]
        );
      }
      await seedDemoReviews(id);
      sendEmail({ to: email, subject: 'Welcome to ReplyPilot', html: welcomeEmail(name) }).catch(() => {});
      sendEmail({
        to: 'Christophersw1011@gmail.com',
        subject: `New ReplyPilot signup (Google): ${name}`,
        html: `<p>New user signed up via Google on ReplyPilot.</p><ul><li><strong>Name:</strong> ${name}</li><li><strong>Email:</strong> ${email}</li><li><strong>Plan:</strong> Free</li><li><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</li></ul>`
      }).catch(() => {});
      user = await db.asyncGet('SELECT * FROM users WHERE id = ?', [id]);
      isNew = true;
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.redirect(`${FRONTEND_URL}/dashboard.html?token=${token}&google_login=true${isNew ? '&new=true' : ''}`);
  } catch (err) {
    console.error('Google auth callback error:', err.message);
    res.redirect(`${FRONTEND_URL}/login.html?error=google_failed`);
  }
});

router.delete('/account', authenticate, async (req, res) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey && !stripeKey.includes('...') && req.user.stripe_subscription_id) {
      try {
        const stripe = require('stripe')(stripeKey);
        await stripe.subscriptions.cancel(req.user.stripe_subscription_id);
      } catch(e) {
        console.error('Stripe cancel error:', e.message);
      }
    }
    await db.asyncRun('DELETE FROM reviews WHERE user_id = ?', [req.user.id]);
    await db.asyncRun('DELETE FROM users WHERE id = ?', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;
