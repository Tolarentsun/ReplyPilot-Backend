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

// Serve JS/HTML with no-cache so browsers always get the latest version
app.get('/config.js', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(__dirname, 'config.js')); });
app.get('/dashboard.html', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(__dirname, 'dashboard.html')); });
app.get('/index.html', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(__dirname, 'index.html')); });

app.use(express.static(path.join(__dirname), { index: 'index.html' }));
app.get('/dashboard', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(__dirname, 'dashboard.html')); });
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/forgot-password', (req, res) => res.sendFile(path.join(__dirname, 'forgot-password.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'reset-password.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'contact.html')));

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
  if (req.accepts('html') && !req.path.startsWith('/api/')) {
    return res.status(404).sendFile(path.join(__dirname, '404.html'));
  }
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 ReplyPilot API running on port ${PORT}`);
});

// Daily Google review sync — runs at 3am UTC every day
try {
  const cron = require('node-cron');
  const db = require('./db/database');
  const { syncGoogleReviews, refreshTokenIfNeeded } = require('./routes/google');

  cron.schedule('0 3 * * *', async () => {
    console.log('[Cron] Starting daily Google review sync...');
    try {
      const users = await db.asyncAll(
        'SELECT * FROM users WHERE google_connected = true AND google_access_token IS NOT NULL',
        []
      );
      console.log(`[Cron] Syncing ${users.length} connected account(s)`);

      for (const user of users) {
        try {
          const token = await refreshTokenIfNeeded(user);
          const count = await syncGoogleReviews(user.id, token, user.google_location_id);
          if (count > 0) console.log(`[Cron] ${user.email}: synced ${count} new review(s)`);
        } catch (e) {
          console.error(`[Cron] Failed for ${user.email}:`, e.message);
        }
      }
      console.log('[Cron] Daily sync complete');
    } catch (e) {
      console.error('[Cron] Sync job error:', e.message);
    }
  });

  console.log('✅ Daily Google sync scheduled (3am UTC)');
} catch (e) {
  console.error('Cron setup failed:', e.message);
}
