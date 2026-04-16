const express = require('express');
const app = express();

// Simple health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check called');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'ReplyPilot API (Test Version)',
    version: '1.0.0',
    health: '/health'
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Health check at http://localhost:${PORT}/health`);
  console.log(`✅ Root at http://localhost:${PORT}/`);
});
