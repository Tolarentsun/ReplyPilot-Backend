// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

console.log("✅ Server file loaded");
console.log("JWT_SECRET exists:", !!process.env.JWT_SECRET);

app.use(express.json());

app.use(cors({
  origin: true,        // Allow all for now (we'll tighten later)
  credentials: true
}));

// Import auth routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Health check - MUST respond quickly
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '1.3.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'ReplyPilot Backend is running!' });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server successfully started on port ${PORT}`);
  console.log(`Health check available at /health`);
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err.message);
});
