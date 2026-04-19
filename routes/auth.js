const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { seedDemoReviews } = require('../db/seedData');

const JWT_SECRET = process.env.JWT_SECRET || 'replypilot-secret-change-in-production';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, business_name, business_type } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const id = generateId();
    const passwordHash = await bcrypt.hash(password, 12);

    db.prepare(`INSERT INTO users (id, name, email, password_hash, business_name, business_type, plan) VALUES (?, ?, ?, ?, ?, ?, 'free')`)
      .run(id, name, email.toLowerCase(), passwordHash, business_name || null, business_type || null);

    await seedDemoReviews(id);

    const user = db.prepare('SELECT id, name, email, plan, business_name, business_type, created_at FROM users WHERE id = ?').get(id);
    const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '30d' });

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

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
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

router.get('/me', authenticate, (req, res) => {
  const { password_hash, ...safeUser } = req.user;
  res.json({ success: true, user: safeUser });
});

router.put('/profile', authenticate, (req, res) => {
  try {
    const { name, business_name, business_type } = req.body;
    db.prepare(`UPDATE users SET name = ?, business_name = ?, business_type = ? WHERE id = ?`)
      .run(name || req.user.name, business_name || null, business_type || null, req.user.id);
    const updated = db.prepare('SELECT id, name, email, plan, business_name, business_type FROM users WHERE id = ?').get(req.user.id);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ error: 'Profile update failed' });
  }
});

module.exports = router;
