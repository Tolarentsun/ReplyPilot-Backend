const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

// === RAILWAY HEALTH CHECK ===
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    message: 'ReplyPilot Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Keep root as well (harmless)
app.get('/', (req, res) => {
  res.json({ message: 'ReplyPilot Backend is running 🚀' });
});

// TODO: Add your full /api/generate-replies endpoint later once /health works

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`   Health check → /health`);
});
