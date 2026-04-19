// PostgreSQL database with in-memory fallback
let usePostgres = false;
let pool = null;

// Try to connect to PostgreSQL
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    usePostgres = true;
    console.log('✅ PostgreSQL connected');
  } catch(e) {
    console.error('PostgreSQL failed, using memory store:', e.message);
  }
}

// Initialize PostgreSQL schema
async function initSchema() {
  if (!usePostgres) return;
  try {
    await pool.query(`
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
        created_at TEXT DEFAULT now()::text,
        updated_at TEXT DEFAULT now()::text
      );
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        platform TEXT DEFAULT 'google',
        reviewer_name TEXT NOT NULL,
        rating INTEGER NOT NULL,
        review_text TEXT NOT NULL,
        review_date TEXT NOT NULL,
        sentiment TEXT,
        sentiment_score REAL,
        keywords TEXT,
        ai_response TEXT,
        response_status TEXT DEFAULT 'pending',
        responded_at TEXT,
        source TEXT DEFAULT 'manual',
        created_at TEXT DEFAULT now()::text,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS ai_generations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        review_id TEXT,
        prompt TEXT,
        response TEXT,
        model TEXT,
        created_at TEXT DEFAULT now()::text
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_sentiment ON reviews(sentiment);
      CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
    `);
    console.log('✅ PostgreSQL schema ready');
  } catch(e) {
    console.error('Schema init error:', e.message);
  }
}

// Run schema init
initSchema();

// ─── PostgreSQL query helpers ───────────────────────────────────────────────
async function pgQuery(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function pgGet(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

async function pgRun(sql, params = []) {
  const result = await pool.query(sql, params);
  return { changes: result.rowCount };
}

// ─── In-memory fallback store ────────────────────────────────────────────────
const store = { users: [], reviews: [], ai_generations: [] };
const now = () => new Date().toISOString();

function memPrepare(sql) {
  const sl = sql.trim().toLowerCase();
  return {
    run(...params) {
      if (sl.startsWith('insert into users')) {
        store.users.push({ id:params[0],name:params[1],email:params[2],password_hash:params[3],business_name:params[4]||null,business_type:params[5]||null,plan:params[6]||'free',stripe_customer_id:null,stripe_subscription_id:null,subscription_status:'inactive',subscription_ends_at:null,created_at:now(),updated_at:now() });
        return { changes: 1 };
      }
      if (sl.startsWith('insert into reviews')) {
        store.reviews.push({ id:params[0],user_id:params[1],platform:params[2],reviewer_name:params[3],rating:parseInt(params[4]),review_text:params[5],review_date:params[6],sentiment:params[7],sentiment_score:params[8],keywords:params[9],response_status:params[10]||'pending',source:params[11]||'manual',ai_response:null,responded_at:null,created_at:now() });
        return { changes: 1 };
      }
      if (sl.startsWith('insert into ai_generations')) {
        store.ai_generations.push({ id:params[0],user_id:params[1],review_id:params[2],prompt:params[3],response:params[4],model:params[5],created_at:now() });
        return { changes: 1 };
      }
      if (sl.startsWith('update users') && sl.includes('set plan')) {
        const u = store.users.find(u => u.id === params[params.length-1]);
        if (u) { u.plan=params[0]; u.subscription_status=params[1]||'active'; u.subscription_ends_at=params[2]||null; u.updated_at=now(); }
        return { changes: 1 };
      }
      if (sl.startsWith('update users') && sl.includes('set name')) {
        const u = store.users.find(u => u.id === params[params.length-1]);
        if (u) { u.name=params[0]; u.business_name=params[1]; u.business_type=params[2]; u.updated_at=now(); }
        return { changes: 1 };
      }
      if (sl.startsWith('update reviews') && sl.includes('ai_response')) {
        const r = store.reviews.find(r => r.id === params[params.length-1]);
        if (r) { r.ai_response=params[0]; r.response_status='generated'; }
        return { changes: 1 };
      }
      if (sl.startsWith('update reviews') && sl.includes('responded')) {
        const r = store.reviews.find(r => r.id === params[params.length-1]);
        if (r) { r.response_status='responded'; r.responded_at=now(); if(params[0]) r.ai_response=params[0]; }
        return { changes: 1 };
      }
      if (sl.startsWith('delete from reviews')) {
        const before = store.reviews.length;
        store.reviews = store.reviews.filter(r => r.id !== params[0]);
        return { changes: before - store.reviews.length };
      }
      return { changes: 0 };
    },
    get(...params) {
      if (sl.includes('from users where id')) return store.users.find(u => u.id === params[0]) || null;
      if (sl.includes('from users where email')) return store.users.find(u => u.email === params[0]) || null;
      if (sl.includes('select id from users')) return store.users.find(u => u.email === params[0]) || null;
      if (sl.includes('from reviews where id') && params.length >= 2) return store.reviews.find(r => r.id===params[0] && r.user_id===params[1]) || null;
      if (sl.includes('from reviews where id')) return store.reviews.find(r => r.id === params[0]) || null;
      if (sl.includes('count(*)') || sl.includes('avg(rating)')) {
        const uid = params[0];
        const reviews = store.reviews.filter(r => r.user_id === uid);
        const total = reviews.length;
        if (sl.includes('count(*) as total') && !sl.includes('avg')) return { total };
        return { total_reviews:total, avg_rating: total ? reviews.reduce((a,r)=>a+r.rating,0)/total : 0, positive_count:reviews.filter(r=>r.sentiment==='positive').length, negative_count:reviews.filter(r=>r.sentiment==='negative').length, neutral_count:reviews.filter(r=>r.sentiment==='neutral').length, responded_count:reviews.filter(r=>r.response_status==='responded').length, pending_count:reviews.filter(r=>r.response_status==='pending').length };
      }
      return null;
    },
    all(...params) {
      const uid = params[0];
      if (sl.includes('from reviews')) {
        let results = store.reviews.filter(r => r.user_id === uid);
        if (sl.includes('order by review_date desc')) results.sort((a,b) => b.review_date.localeCompare(a.review_date));
        else if (sl.includes('order by rating desc')) results.sort((a,b) => b.rating - a.rating);
        else if (sl.includes('order by rating asc')) results.sort((a,b) => a.rating - b.rating);
        else results.sort((a,b) => b.review_date.localeCompare(a.review_date));
        const limitMatch = sl.match(/limit (\d+)/);
        const offsetMatch = sl.match(/offset (\d+)/);
        const offset = offsetMatch ? parseInt(offsetMatch[1]) : 0;
        const limit = limitMatch ? parseInt(limitMatch[1]) : 50;
        return results.slice(offset, offset + limit);
      }
      if (sl.includes('group by rating')) {
        const reviews = store.reviews.filter(r => r.user_id === uid);
        const dist = {};
        reviews.forEach(r => { dist[r.rating] = (dist[r.rating]||0)+1; });
        return Object.entries(dist).map(([rating,count]) => ({ rating:parseInt(rating), count })).sort((a,b) => b.rating-a.rating);
      }
      if (sl.includes('group by platform')) {
        const reviews = store.reviews.filter(r => r.user_id === uid);
        const dist = {};
        reviews.forEach(r => { if(!dist[r.platform]) dist[r.platform]={platform:r.platform,count:0,total_rating:0}; dist[r.platform].count++; dist[r.platform].total_rating+=r.rating; });
        return Object.values(dist).map(d => ({ platform:d.platform, count:d.count, avg_rating:d.total_rating/d.count }));
      }
      if (sl.includes('keywords is not null')) return store.reviews.filter(r => r.user_id===uid && r.keywords);
      if (sl.includes('from users')) return store.users;
      return [];
    }
  };
}

// ─── Unified async DB interface ──────────────────────────────────────────────
// All route files call db.prepare(sql).run/get/all synchronously
// We wrap postgres in a sync-like interface using a queue trick
// Actually: expose async versions and update routes to use them

const db = {
  usePostgres,
  _store: store,

  // Async methods for PostgreSQL (used in routes)
  async asyncGet(sql, params = []) {
    if (usePostgres) {
      // Convert ? placeholders to $1, $2...
      let i = 0;
      const pgSql = sql.replace(/\?/g, () => `$${++i}`);
      return pgGet(pgSql, params);
    }
    return memPrepare(sql).get(...params);
  },

  async asyncAll(sql, params = []) {
    if (usePostgres) {
      let i = 0;
      const pgSql = sql.replace(/\?/g, () => `$${++i}`);
      return pgQuery(pgSql, params);
    }
    return memPrepare(sql).all(...params);
  },

  async asyncRun(sql, params = []) {
    if (usePostgres) {
      let i = 0;
      const pgSql = sql.replace(/\?/g, () => `$${++i}`);
      return pgRun(pgSql, params);
    }
    return memPrepare(sql).run(...params);
  },

  // Sync-compatible prepare (falls back to memory if postgres)
  prepare(sql) {
    if (!usePostgres) return memPrepare(sql);
    // Return async-wrapped sync-looking interface
    return {
      run: (...params) => db.asyncRun(sql, params),
      get: (...params) => db.asyncGet(sql, params),
      all: (...params) => db.asyncAll(sql, params)
    };
  },

  exec() { return this; },
  pragma() { return this; },
  transaction(fn) { return (...args) => fn(...args); },
  pool
};

module.exports = db;
