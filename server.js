const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Health Check - MUST work for Railway
app.get('/health', (req, res) => {
  res.json({ 
    status: "healthy", 
    message: "ReplyPilot Backend is running" 
  });
});

// Basic test route
app.get('/', (req, res) => {
  res.json({ message: "Backend is alive" });
});

// Placeholder for generate replies (we'll expand this later)
app.post('/api/generate-replies', (req, res) => {
  res.status(501).json({ 
    success: false, 
    error: "AI generation not implemented yet. Working on it." 
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
