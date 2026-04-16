const { db, runQuery, getQuery, allQuery, initializeDatabase } = require('./sqlite');

console.log('SQLite database ready');

// Initialize database tables
initializeDatabase();

// PostgreSQL-style query functions for compatibility
const pool = {
  query: async (text, params) => {
    try {
      if (text.startsWith('SELECT') || text.startsWith('WITH')) {
        if (text.includes('COUNT')) {
          const countQuery = text.replace(/SELECT.*FROM/i, 'SELECT COUNT(*) as count FROM');
          const result = await getQuery(countQuery, params);
          return { rows: [{ count: result.count }] };
        }
        const rows = await allQuery(text, params);
        return { rows };
      } else if (text.startsWith('INSERT')) {
        const result = await runQuery(text, params);
        return { rows: [{ id: result.id }] };
      } else if (text.startsWith('UPDATE') || text.startsWith('DELETE')) {
        const result = await runQuery(text, params);
        return { rows: [], rowCount: result.changes || 1 };
      } else {
        // Generic query
        await runQuery(text, params);
        return { rows: [] };
      }
    } catch (error) {
      console.error('Query error:', text, error);
      throw error;
    }
  }
};

async function initializeDatabase() {
  try {
    // Tables already created in sqlite.js
    console.log('Database tables initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'trial',
        plan VARCHAR(50) DEFAULT 'free',
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        current_period_end TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS review_platforms (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        platform VARCHAR(50) NOT NULL,
        platform_id VARCHAR(255),
        access_token TEXT,
        refresh_token TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, platform)
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        platform_id INTEGER REFERENCES review_platforms(id) ON DELETE CASCADE,
        external_id VARCHAR(255) NOT NULL,
        platform VARCHAR(50) NOT NULL,
        customer_name VARCHAR(255),
        customer_photo_url TEXT,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        text TEXT,
        business_name VARCHAR(255),
        business_location VARCHAR(255),
        review_date TIMESTAMP,
        status VARCHAR(50) DEFAULT 'new',
        priority VARCHAR(50) DEFAULT 'medium',
        response_text TEXT,
        response_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, platform, external_id)
      );

      CREATE TABLE IF NOT EXISTS responses (
        id SERIAL PRIMARY KEY,
        review_id INTEGER REFERENCES reviews(id) ON DELETE CASCADE,
        draft_text TEXT NOT NULL,
        tone VARCHAR(50),
        final_text TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
      CREATE INDEX IF NOT EXISTS idx_reviews_platform ON reviews(platform);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
    `);
    
    console.log('Database tables initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Run initialization
initializeDatabase();

module.exports = { pool };
