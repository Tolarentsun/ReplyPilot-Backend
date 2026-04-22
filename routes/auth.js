const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { seedDemoReviews } = require('../db/seedData');
const { sendEmail, welcomeEmail, passwordResetEmail } = require('./email');

const JWT_SECRET = process.env.JWT_SECRET || 'replypilot-secret-change-in-production';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, business_name, business_type } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await db.asyncGet('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const id = generateId();
    const passwordHash = await bcrypt.hash(password, 12);

    await db.asyncRun(
      `INSERT INTO users (id, name, email, password_hash, business_name, business_type, plan) VALUES (?, ?, ?, ?, ?, ?, 'free')`,
      [id, name, email.toLowerCase(), passwordHash, business_name || null, business_type || null]
    );

    await seedDemoReviews(id);

    const user = await db.asyncGet('SELECT id, name, email, plan, business_name, business_type, created_at FROM users WHERE id = ?', [id]);
    const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '30d' });

    sendEmail({ to: email, subject: 'Welcome to ReplyPilot', html: welcomeEmail(name) }).catch(() => {});

    res.json({ success: true, token, user });
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
