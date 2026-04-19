const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: "healthy", 
    message: "ReplyPilot Backend is running" 
  });
});

// Generate Smart Replies
app.post('/api/generate-replies', async (req, res) => {
  const { text, tone = "Professional", count = 4 } = req.body;

  if (!text || text.trim() === "") {
    return res.status(400).json({ 
      success: false, 
      error: "Review text is required" 
    });
  }

  try {
    const prompt = `You are an expert at writing helpful, natural replies to customer reviews.

Customer review:
"""
${text}
"""

Generate exactly ${count} different reply options in a **${tone}** tone.
Make them sound warm, professional, and human.
For each reply, include a short descriptive label.

Return ONLY a valid JSON array like this:
[
  {"label": "Warm & Grateful", "reply": "Thank you so much for your kind words..."},
  ...
]`;

    const completion = await openai.chat.completions.create({
      model: "deepseek/deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.75,
      max_tokens: 1000,
    });

    let replies = [];
    try {
      replies = JSON.parse(completion.choices[0].message.content.trim());
    } catch (e) {
      replies = [{ 
        label: "AI Generated Reply", 
        reply: completion.choices[0].message.content 
      }];
    }

    res.json({ success: true, replies });

  } catch (error) {
    console.error("Generate Replies Error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to generate replies. Please check OpenRouter credits." 
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ ReplyPilot Backend running on port ${PORT}`);
});
