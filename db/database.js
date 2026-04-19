const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'replypilot.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db;
try {
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  console.log('✅ SQLite ready at', DB_PATH);
} catch (e) {
  console.warn('⚠️  better-sqlite3 not available, using in-memory store:', e.message);
  db = createMemoryDB();
}

function createMemoryDB() {
  const store = { users: [], reviews: [], ai_generations: [] };

  function matchesWhere(obj, sql, params) {
    const s = sql.toLowerCase();
    if (s.includes('where id =') || s.includes('where id=')) return obj.id === params[0];
    if (s.includes('where email =') || s.includes('where email=')) return obj.email === params[0];
    if (s.includes('where user_id =') || s.includes('user_id=')) return obj.user_id === params[0];
    if (s.includes('where id = ? and user_id = ?')) return obj.id === params[0] && obj.user_id === params[1];
    return true;
  }

  return {
    _store: store,
    prepare(sql) {
      const s = sql.trim().toLowerCase();
      return {
        run(...params) {
          if (s.startsWith('insert into users')) {
            store.users.push({ id:params[0],name:params[1],email:params[2],password_hash:params[3],business_name:params[4]||null,business_type:params[5]||null,plan:params[6]||'free',stripe_customer_id:null,stripe_subscription_id:null,subscription_status:'inactive',subscription_ends_at:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString() });
            return { changes: 1 };
          }
          if (s.startsWith('insert into reviews')) {
            store.reviews.push({ id:params[0],user_id:params[1],platform:params[2],reviewer_name:params[3],rating:params[4],review_text:params[5],review_date:params[6],sentiment:params[7],sentiment_score:params[8],keywords:params[9],response_status:params[10]||'pending',source:params[11]||'manual',ai_response:null,responded_at:null,created_at:new Date().toISOString() });
            return { changes: 1 };
          }
          if (s.startsWith('insert into ai_generations')) {
            store.ai_generations.push({ id:params[0],user_id:params[1],review_id:params[2],prompt:params[3],response:params[4],model:params[5],created_at:new Date().toISOString() });
            return { changes: 1 };
          }
          if (s.startsWith('update users')) {
            const idx = store.users.findIndex(u => u.id === params[params.length-1]);
            if (idx >= 0) {
              if (s.includes('set plan')) store.users[idx].plan = params[0];
              if (s.includes('set name')) { store.users[idx].name = params[0]; store.users[idx].business_name = params[1]; store.users[idx].business_type = params[2]; }
              if (s.includes('ai_response')) { const r = store.reviews.find(r => r.id === params[1]); if(r) { r.ai_response = params[0]; r.response_status = 'generated'; } }
              store.users[idx].updated_at = new Date().toISOString();
            }
            return { changes: 1 };
          }
          if (s.startsWith('update reviews')) {
            const id = params[params.length-1];
            const r = store.reviews.find(r => r.id === id);
            if (r) {
              if (s.includes('ai_response')) { r.ai_response = params[0]; r.response_status = params[1] || 'generated'; }
              if (s.includes('response_status')) { r.response_status = 'responded'; r.responded_at = new Date().toISOString(); if(params[0]) r.ai_response = params[0]; }
            }
            return { changes: 1 };
          }
          if (s.startsWith('delete from reviews')) {
            store.reviews = store.reviews.filter(r => r.id !== params[0]);
            return { changes: 1 };
          }
          return { changes: 0 };
        },
        get(...params) {
          if (s.includes('from users where id')) return store.users.find(u => u.id === params[0]) || null;
          if (s.includes('from users where email')) return store.users.find(u => u.email === params[0]) || null;
          if (s.includes('from reviews where id') && s.includes('user_id')) return store.reviews.find(r => r.id === params[0] && r.user_id === params[1]) || null;
          if (s.includes('from reviews where id')) return store.reviews.find(r => r.id === params[0]) || null;
          if (s.includes('count(*) as total')) {
            let r = store.reviews.filter(x => x.user_id === params[0]);
            return { total: r.length };
          }
          if (s.includes('avg(rating)') || s.includes('count(*)')) {
            const uid = params[0];
            const reviews = store.reviews.filter(r => r.user_id === uid);
            const total = reviews.length;
            const avg_rating = total ? reviews.reduce((a,r) => a+r.rating, 0)/total : 0;
            return { total_reviews: total, avg_rating, positive_count: reviews.filter(r=>r.sentiment==='positive').length, negative_count: reviews.filter(r=>r.sentiment==='negative').length, neutral_count: reviews.filter(r=>r.sentiment==='neutral').length, responded_count: reviews.filter(r=>r.response_status==='responded').length, pending_count: reviews.filter(r=>r.response_status==='pending').length };
          }
          return null;
        },
        all(...params) {
          const uid = params[0];
          if (s.includes('from reviews')) {
            let results = store.reviews.filter(r => r.user_id === uid);
            if (s.includes('order by review_date desc')) results.sort((a,b) => b.review_date.localeCompare(a.review_date));
            if (s.includes('order by review_date asc')) results.sort((a,b) => a.review_date.localeCompare(b.review_date));
            if (s.includes('order by rating desc')) results.sort((a,b) => b.rating - a.rating);
            if (s.includes('order by rating asc')) results.sort((a,b) => a.rating - b.rating);
            const limitMatch = s.match(/limit (\d+)/);
            if (limitMatch) results = results.slice(0, parseInt(limitMatch[1]));
            return results;
          }
          if (s.includes('from users')) return store.users;
          return [];
        }
      };
    },
    exec() { return this; },
    pragma() { return this; },
    transaction(fn) { return (...args) => fn(...args); }
  };
}

// Init schema for real SQLite
if (db.exec && db._store === undefined) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, plan TEXT DEFAULT 'free',
      stripe_customer_id TEXT, stripe_subscription_id TEXT,
      subscription_status TEXT DEFAULT 'inactive', subscription_ends_at TEXT,
      business_name TEXT, business_type TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'google', reviewer_name TEXT NOT NULL,
      reviewer_avatar TEXT, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      review_text TEXT NOT NULL, review_date TEXT NOT NULL,
      sentiment TEXT, sentiment_score REAL, keywords TEXT,
      ai_response TEXT, response_status TEXT DEFAULT 'pending',
      responded_at TEXT, source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS ai_generations (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, review_id TEXT,
      prompt TEXT, response TEXT, tokens_used INTEGER DEFAULT 0, model TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
    CREATE INDEX IF NOT EXISTS idx_reviews_sentiment ON reviews(sentiment);
  `);
}

module.exports = db;
