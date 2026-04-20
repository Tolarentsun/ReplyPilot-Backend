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

// Health check FIRST
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});
app.get('/', (req, res) => {
  res.json({ message: 'ReplyPilot API v2.0', status: 'running' });
});

try { require('dotenv').config(); } catch(e) {}

try {
  const cors = require('cors');
  app.use(cors({ origin: '*', credentials: true }));
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
