const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ====================== MIDDLEWARE ======================
app.use(cors({
  origin: true,           // Change to your Netlify URL later for security
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Rate limiting (must be required early)
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// ====================== HEALTH CHECK ======================
app.get('/', (req, res) => {
  res.json({
    message: 'ReplyPilot Backend is running 🚀',
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// ====================== MAIN AI ENDPOINT ======================
app.post('/api/generate-replies', async (req, res) => {
  try {
    const { text, tone = 'professional', count = 4, context = '' } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Text is required' 
      });
    }

    // Load OpenAI SDK only when needed
    const { OpenAI } = require('openai');

    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://your-netlify-site.netlify.app', // ← CHANGE THIS
        'X-Title': 'ReplyPilot',
      },
    });

    const prompt = `
You are ReplyPilot, an expert at writing natural, human-like replies.

Original message:
"""
${text}
"""

Additional context: ${context || 'None'}

Generate exactly ${count} different reply options in a **${tone}** tone.
Make each reply sound natural and varied in style.

For each reply, return a JSON object with:
- "label": a short descriptive name (e.g. "Warm & Empathetic", "Short & Direct")
- "reply": the full reply text

Return ONLY a valid JSON array like this:
[
  { "label": "...", "reply": "..." },
  ...
]
`;

    const completion = await openai.chat.completions.create({
      model: 'deepseek/deepseek-chat',   // You can change this
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.75,
      max_tokens: 1500,
    });

    let replies = [];
    try {
      const raw = completion.choices[0].message.content.trim();
      replies = JSON.parse(raw);
    } catch (e) {
      console.error('JSON parse failed:', e);
      replies = [{ 
        label: "AI Response", 
        reply: completion.choices[0].message.content 
      }];
    }

    res.json({
      success: true,
      replies: Array.isArray(replies) ? replies : [replies]
    });

  } catch (error) {
    console.error('Generate replies error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// ====================== START SERVER ======================
app.listen(PORT, () => {
  console.log(`✅ ReplyPilot Backend is running on port ${PORT}`);
  console.log(`   Health check → http://localhost:${PORT}/`);
});
