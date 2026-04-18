const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;   // Railway will inject PORT automatically

// Middleware
app.use(cors({
  origin: true,                    // Allow all origins for now (you can lock it to your Netlify URL later)
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Simple rate limiting (optional but recommended)
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,                         // adjust as needed
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Health check route (helpful for Railway)
app.get('/', (req, res) => {
  res.json({ 
    message: 'ReplyPilot Backend is running 🚀',
    status: 'ok',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Main endpoint
app.post('/api/generate-replies', async (req, res) => {
  try {
    const { text, tone = 'professional', count = 4, context = '' } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // We'll use OpenAI SDK with OpenRouter
    const { OpenAI } = require('openai');
    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://your-netlify-site.netlify.app', // replace with your actual Netlify URL
        'X-Title': 'ReplyPilot',
      },
    });

    const prompt = `You are ReplyPilot...`; // (keep the same good prompt from before)

    const completion = await openai.chat.completions.create({
      model: 'deepseek/deepseek-chat',     // or any model you prefer
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.75,
      max_tokens: 1200,
    });

    let replies = [];
    try {
      const raw = completion.choices[0].message.content.trim();
      replies = JSON.parse(raw);
    } catch (e) {
      replies = [{ label: "AI Response", reply: completion.choices[0].message.content }];
    }

    res.json({
      success: true,
      replies: Array.isArray(replies) ? replies : [replies]
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Something went wrong on the server'
    });
  }
});

app.listen(PORT, () => {
  console.log(`ReplyPilot Backend listening on port ${PORT}`);
});
