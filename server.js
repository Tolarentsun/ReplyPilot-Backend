// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());

// CORS - Update this with your Netlify URL later
app.use(cors({
  origin: [
    "https://your-netlify-site.netlify.app",   // ← Change this when you deploy to Netlify
    "http://localhost:3000",
    "http://127.0.0.1:5500",
    "http://localhost:4000"
  ],
  credentials: true
}));

// Import routes
const authRoutes = require('./routes/auth');

// Use routes
app.use('/api/auth', authRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ReplyPilot Backend',
    version: '1.3.0',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: '🚀 ReplyPilot Backend is running!',
    version: '1.3.0',
    endpoints: {
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      health: '/health'
    }
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 ReplyPilot Backend running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
});
