const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

// Create SQLite database (file-based, no installation needed)
const db = new sqlite3.Database(path.join(__dirname, 'replypilot.db'));

// Initialize database tables
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Users table
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    name TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Subscriptions table
            db.run(`
                CREATE TABLE IF NOT EXISTS subscriptions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    status TEXT DEFAULT 'trial',
                    plan TEXT DEFAULT 'free',
                    stripe_customer_id TEXT,
                    stripe_subscription_id TEXT,
                    current_period_end DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            `);

            // Review platforms table
db.run(`
                CREATE TABLE IF NOT EXISTS review_platforms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    platform TEXT NOT NULL,
                    platform_id TEXT,
                    access_token TEXT,
                    refresh_token TEXT,
                    metadata TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, platform),
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            `);

            // Reviews table

db.run(`
                CREATE TABLE IF NOT EXISTS reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    platform TEXT NOT NULL,
                    external_id TEXT NOT NULL,
                    customer_name TEXT,
                    customer_photo_url TEXT,
                    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
                    text TEXT,
                    business_name TEXT,
                    business_location TEXT,
                    review_date DATETIME,
                    status TEXT DEFAULT 'new',
                    priority TEXT DEFAULT 'medium',
                    response_text TEXT,
                    response_date DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, platform, external_id),
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            `);

            // Responses table

db.run(`
                CREATE TABLE IF NOT EXISTS responses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    review_id INTEGER NOT NULL,
                    draft_text TEXT NOT NULL,
                    tone TEXT,
                    final_text TEXT,
                    status TEXT DEFAULT 'draft',
                    published_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (review_id) REFERENCES reviews (id) ON DELETE CASCADE

                )
            `);

            // Create indexes

db.run('CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status)');
            db.run('CREATE INDEX IF NOT EXISTS idx_reviews_platform ON reviews(platform)');
            db.run('CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)');

            console.log('SQLite database initialized successfully');
            resolve();
        });
    });
}

// Helper function for queries
function runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID });
        });
    });
}

function getQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Run initialization
initializeDatabase();

module.exports = {
    db,
    runQuery,
    getQuery,
    allQuery,
    initializeDatabase
};
