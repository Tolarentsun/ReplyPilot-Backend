const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const rateLimit = require('express-rate-limit');
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
}));

// === HEALTH CHECK FOR RAILWAY ===
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    message: 'ReplyPilot Backend is running 🚀',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Optional: keep root as well
app.get('/', (req, res) => {
  res.json({ message: 'ReplyPilot Backend is running' });
});

// Main AI endpoint
app.post('/api/generate-replies', async (req, res) => {
  try {
    const { text, tone = 'professional', count = 4, context = '' } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Text is required' });
    }

    const { OpenAI } = require('openai');
    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://your-netlify-site.netlify.app', // ← Update this
        'X-Title': 'ReplyPilot',
      },
    });

    const prompt = `You are ReplyPilot...`;   // Replace with the full good prompt I gave earlier

    const completion = await openai.chat.completions.create({
      model: 'deepseek/deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.75,
      max_tokens: 1200,
    });

    let replies = [];
    try {
      replies = JSON.parse(completion.choices[0].message.content.trim());
    } catch (e) {
      replies = [{ label: "AI Response", reply: completion.choices[0].message.content }];
    }

    res.json({ success: true, replies: Array.isArray(replies) ? replies : [replies] });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ ReplyPilot Backend listening on port ${PORT}`);
});
