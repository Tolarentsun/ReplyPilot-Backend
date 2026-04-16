const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// ===== COMMENT OUT ALL ROUTES FIRST =====
// const authRoutes = require('./routes/auth');
// const userRoutes = require('./routes/users');
// const subscriptionRoutes = require('./routes/subscriptions');
// const googleRoutes = require('./routes/google');

// ===== Routes (comment out all) =====
// app.use('/api/auth', authRoutes);
// app.use('/api/users', userRoutes);
// app.use('/api/subscriptions', subscriptionRoutes);
// app.use('/api/google', googleRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root
app.get('/', (req, res) => {
  res.json({ 
    message: 'ReplyPilot API',
    version: '1.0.0',
    endpoints: {
      // No routes yet
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ ReplyPilot API running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});
