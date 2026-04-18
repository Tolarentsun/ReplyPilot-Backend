const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-this-in-production";

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Database setup
const db = new sqlite3.Database('./db/users.db', (err) => {
  if (err) console.error('Database error:', err);
  else console.log('Connected to SQLite database');
});

// Create users table if not exists
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Health check (already working)
app.get('/health', (req, res) => {
  res.json({
    status: "healthy",
    message: "ReplyPilot Backend is running",
    timestamp: new Date().toISOString()
  });
});

// Register
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Email and password are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run("INSERT INTO users (email, password) VALUES (?, ?)", [email, hashedPassword], function(err) {
      if (err) {
        return res.status(400).json({ success: false, error: "User already exists" });
      }

      const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET, { expiresIn: '7d' });

      res.json({
        success: true,
        token,
        user: { id: this.lastID, email }
      });
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Email and password are required" });
  }

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err || !user) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email }
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
