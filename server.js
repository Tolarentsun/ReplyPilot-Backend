// server.js - Diagnostic Version
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();

console.log("=== Server Starting ===");
console.log("JWT_SECRET loaded:", !!process.env.JWT_SECRET);
console.log("NODE_ENV:", process.env.NODE_ENV || "not set");
console.log("PORT:", process.env.PORT || 4000);

app.use(express.json());

app.use(cors({
  origin: true,
  credentials: true
}));

// Import routes safely
let authRoutes;
try {
  authRoutes = require('./routes/auth');
  console.log("✅ Auth routes loaded successfully");
  app.use('/api/auth', authRoutes);
} catch (err) {
  console.error("❌ Failed to load auth routes:", err.message);
}

// Health check - must respond fast
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '1.3.0',
    jwt_loaded: !!process.env.JWT_SECRET,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'ReplyPilot Backend is running!' });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server successfully started on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
}).on('error', (err) => {
  console.error('❌ Failed to start server:', err.message);
});
