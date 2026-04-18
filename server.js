const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const { OpenAI } = require('openai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET is missing in Railway variables!");
}

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Database
const db = new sqlite3.Database('./db/users.db');

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: "healthy", message: "ReplyPilot Backend is running" });
});

// Register
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: "Email and password required" });

  try {
    const hashed = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users (email, password) VALUES (?, ?)", [email, hashed], function(err) {
      if (err) return res.status(400).json({ success: false, error: "User already exists" });
      const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ success: true, token, user: { id: this.lastID, email } });
    });
  } catch (e) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: "Email and password required" });

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err || !user) return res.status(401).json({ success: false, error: "Invalid credentials" });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ success: false, error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user.id, email: user.email } });
  });
});

// Generate Smart Replies
app.post('/api/generate-replies', async (req, res) => {
  const { text, tone = "Professional", count = 4 } = req.body;

  if (!text) {
    return res.status(400).json({ success: false, error: "Review text is required" });
  }

  try {
    const prompt = `You are an expert customer service writer.

Customer review:
"""
${text}
"""

Generate exactly ${count} natural, professional replies in a **${tone}** tone.
Make them sound human and helpful.
Return ONLY a valid JSON array like this:
[
  {"label": "Warm Thankful", "reply": "Thank you so much for your kind words..."},
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
      replies = [{ label: "AI Reply", reply: completion.choices[0].message.content }];
    }

    res.json({ success: true, replies });

  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ success: false, error: "Failed to generate replies. Check OpenRouter credits." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ ReplyPilot Backend running on port ${PORT}`);
});
