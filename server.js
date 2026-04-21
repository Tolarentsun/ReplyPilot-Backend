const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

// Trust Railway's proxy
app.set('trust proxy', 1);

// Health check FIRST (before static files so Railway health check always responds)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

// Serve HTML pages
const path = require('path');
app.use(express.static(path.join(__dirname), { index: 'index.html' }));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));

try { require('dotenv').config(); } catch(e) {}

try {
  const cors = require('cors');
  const rawOrigin = process.env.FRONTEND_URL || '';
  const toOrigin = url => { try { const u = new URL(url); return u.origin; } catch { return url; } };
  const allowedOrigins = rawOrigin
    ? [toOrigin(rawOrigin), 'https://reply-pilot.net', 'https://www.reply-pilot.net']
    : ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'];
  app.use(cors({ origin: allowedOrigins, credentials: true }));
} catch(e) { console.error('cors failed:', e.message); }

try {
  const helmet = require('helmet');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
} catch(e) { console.error('helmet failed:', e.message); }

app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

try {
  const rateLimit = require('express-rate-limit');
  app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
} catch(e) { console.error('rateLimit failed:', e.message); }

try {
  app.use('/api/auth', require('./routes/auth'));
  console.log('✅ Auth routes loaded');
} catch(e) { console.error('❌ Auth routes failed:', e.message); }

try {
  app.use('/api/reviews', require('./routes/reviews'));
  console.log('✅ Review routes loaded');
} catch(e) { console.error('❌ Review routes failed:', e.message); }

try {
  app.use('/api/subscriptions', require('./routes/Subscriptions'));
  console.log('✅ Subscription routes loaded');
} catch(e) { console.error('❌ Subscription routes failed:', e.message); }

try {
  app.use('/api/insights', require('./routes/insights'));
  console.log('✅ Insights routes loaded');
} catch(e) { console.error('❌ Insights routes failed:', e.message); }

try {
  app.use('/api/google', require('./routes/google'));
  console.log('✅ Google routes loaded');
} catch(e) { console.error('❌ Google routes failed:', e.message); }

try {
  app.use('/api/yelp', require('./routes/yelp'));
  console.log('✅ Yelp routes loaded');
} catch(e) { console.error('❌ Yelp routes failed:', e.message); }

app.get('/api', (req, res) => {
  res.json({ message: 'ReplyPilot API v2.0' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 ReplyPilot API running on port ${PORT}`);
});
