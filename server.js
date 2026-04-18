// server.js - Minimal & Reliable Version
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();

console.log("🚀 Starting ReplyPilot Backend...");

// Middleware
app.use(express.json());
app.use(cors({
  origin: true,
  credentials: true
}));

// Health check - must respond quickly
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ReplyPilot Backend',
    version: '1.3.0',
    timestamp: new Date().toISOString()
  });
});

// Simple root route
app.get('/', (req, res) => {
  res.json({ message: 'ReplyPilot Backend is running!' });
});

// Import auth routes
try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log("✅ Auth routes loaded successfully");
} catch (err) {
  console.error("❌ Failed to load auth routes:", err.message);
}

// Start server
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`✅ Server successfully started on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
}).on('error', (err) => {
  console.error('❌ Failed to start server:', err.message);
});
