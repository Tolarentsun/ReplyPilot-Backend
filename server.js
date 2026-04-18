// server.js - Clean Minimal Version
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(express.json());
app.use(cors({
  origin: true,
  credentials: true
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ReplyPilot Backend',
    version: '1.3.0',
    timestamp: new Date().toISOString()
  });
});

// Root
app.get('/', (req, res) => {
  res.json({ message: 'ReplyPilot Backend is running!' });
});

// Simple test auth routes (temporary)
app.post('/api/auth/register', (req, res) => {
  res.json({
    success: true,
    message: 'Test registration successful',
    token: 'test-jwt-token-' + Date.now()
  });
});

app.post('/api/auth/login', (req, res) => {
  res.json({
    success: true,
    message: 'Test login successful',
    token: 'test-jwt-token-' + Date.now()
  });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
}).on('error', (err) => {
  console.error('Server error:', err);
});
