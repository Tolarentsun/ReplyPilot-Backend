const express = require('express');
const app = express();

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ReplyPilot Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString()
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 ReplyPilot Backend launched on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
});
