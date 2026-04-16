const express = require('express');
const app = express();

app.use(express.json());

console.log('1. Testing database connection...');
try {
  // Try to load database (if files are in correct location)
  const { pool } = require('./db');
  console.log('✅ Database loaded successfully');
} catch (dbError) {
  console.log('❌ Database error:', dbError.message);
  // Continue without database for now
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ReplyPilot Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: 'SQLite (testing)'
  });
});

// Root endpoint (what users see at /)
app.get('/', (req, res) => {
  res.json({
    message: '🚀 ReplyPilot API is running!',
    description: 'Google Review Response Service for Local Businesses',
    version: '1.0.0',
    status: 'operational',
    endpoints: {
      health: '/health',
      documentation: 'Coming soon...',
      upcoming: ['/api/auth', '/api/users', '/api/subscriptions', '/api/google']
    },
    deployment: {
      platform: 'Railway',
      status: 'online',
      url: 'https://replypilot-backend-production.up.railway.app'
    }
  });
});

// Simple test endpoint for auth (if we add routes later)
app.get('/api/auth/test', (req, res) => {
  res.json({ message: 'Auth endpoint placeholder - add real routes later' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 ReplyPilot Backend launched on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ Root endpoint: http://localhost:${PORT}/`);
  console.log(`✅ Public URL: https://replypilot-backend-production.up.railway.app`);
});
