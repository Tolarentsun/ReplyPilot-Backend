const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'db');
const DB_PATH = path.join(DB_DIR, 'replypilot.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    plan TEXT DEFAULT 'free',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT DEFAULT 'inactive',
    subscription_ends_at TEXT,
    business_name TEXT,
    business_type TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'google',
    reviewer_name TEXT NOT NULL,
    reviewer_avatar TEXT,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    review_text TEXT NOT NULL,
    review_date TEXT NOT NULL,
    sentiment TEXT,
    sentiment_score REAL,
    keywords TEXT,
    ai_response TEXT,
    response_status TEXT DEFAULT 'pending',
    responded_at TEXT,
    source TEXT DEFAULT 'manual',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    total_reviews INTEGER DEFAULT 0,
    avg_rating REAL DEFAULT 0,
    sentiment_positive INTEGER DEFAULT 0,
    sentiment_neutral INTEGER DEFAULT 0,
    sentiment_negative INTEGER DEFAULT 0,
    response_rate REAL DEFAULT 0,
    top_keywords TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_generations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    review_id TEXT,
    prompt TEXT,
    response TEXT,
    tokens_used INTEGER DEFAULT 0,
    model TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
  CREATE INDEX IF NOT EXISTS idx_reviews_sentiment ON reviews(sentiment);
  CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);
`);

module.exports = db;
