const { Pool } = require('pg');

let pool = null;

const DB_URL = process.env.POSTGRES_CONNECTION_STRING || process.env.DATABASE_URL || '';

if (DB_URL && DB_URL.length > 10) {
  const isInternal = DB_URL.includes('.railway.internal');
  console.log('Connecting to DB:', DB_URL.replace(/:([^:@]+)@/, ':****@').substring(0, 60));
  pool = new Pool({
    connectionString: DB_URL,
    ssl: isInternal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    max: 10
  });
  console.log('✅ PostgreSQL pool created');
} else {
  console.log('⚠️  No DATABASE_URL set, using in-memory store');
}
async function initSchema() {
  if (!pool) return;
  let client;
  try {
    client = await pool.connect();
    await client.query(`
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
        google_connected BOOLEAN DEFAULT false,
        google_access_token TEXT,
        google_refresh_token TEXT,
        google_location_id TEXT,
        google_business_name TEXT,
        created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        updated_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      );
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
        google_review_id TEXT,
        created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      );
      CREATE TABLE IF NOT EXISTS ai_generations (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        review_id TEXT,
        prompt TEXT,
        response TEXT,
        model TEXT,
        created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_sentiment ON reviews(sentiment);
      CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
    `);
    // Add new columns if they don't exist (migration)
    try {
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_connected BOOLEAN DEFAULT false');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_location_id TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_business_name TEXT');
      await client.query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS google_review_id TEXT');
      await client.query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS yelp_review_id TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS yelp_business_id TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS yelp_business_name TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_persona TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_connected BOOLEAN DEFAULT false');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_access_token TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_page_id TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_page_name TEXT');
      await client.query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS facebook_review_id TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_new_reviews BOOLEAN DEFAULT false');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS review_request_url TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_bonus_reviews INTEGER DEFAULT 0');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_bonus_responses INTEGER DEFAULT 0');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_bonus_responses_used INTEGER DEFAULT 0');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token TEXT');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_expires TEXT');
      // Mark existing users as verified so they aren't locked out
      await client.query("UPDATE users SET email_verified = true WHERE email_verified = false AND created_at < NOW() - INTERVAL '1 minute'");
    } catch(e) {}
    console.log('✅ PostgreSQL schema ready');
  } catch(e) {
    console.error('Schema init error:', e.message);
  } finally {
    if (client) client.release();
  }
}

// Wait 3 seconds for Railway internal network to be ready then init
setTimeout(initSchema, 3000);

function convertSQL(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function pgGet(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(convertSQL(sql), params);
    return result.rows[0] || null;
  } finally { client.release(); }
}

async function pgAll(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(convertSQL(sql), params);
    return result.rows;
  } finally { client.release(); }
}

async function pgRun(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(convertSQL(sql), params);
    return { changes: result.rowCount };
  } finally { client.release(); }
}

// In-memory fallback store
const store = { users: [], reviews: [] };
const now = () => new Date().toISOString();

function memGet(sql, params) {
  const sl = sql.toLowerCase();
  if (sl.includes('from users where id')) return store.users.find(u => u.id === params[0]) || null;
  if (sl.includes('from users where email') || sl.includes('select id from users')) return store.users.find(u => u.email === params[0]) || null;
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
}

function memAll(sql, params) {
  const sl = sql.toLowerCase();
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
    const dist = {};
    store.reviews.filter(r=>r.user_id===uid).forEach(r => { dist[r.rating]=(dist[r.rating]||0)+1; });
    return Object.entries(dist).map(([rating,count])=>({rating:parseInt(rating),count})).sort((a,b)=>b.rating-a.rating);
  }
  if (sl.includes('group by platform')) {
    const dist = {};
    store.reviews.filter(r=>r.user_id===uid).forEach(r => { if(!dist[r.platform]) dist[r.platform]={platform:r.platform,count:0,total_rating:0}; dist[r.platform].count++; dist[r.platform].total_rating+=r.rating; });
    return Object.values(dist).map(d=>({platform:d.platform,count:d.count,avg_rating:d.total_rating/d.count}));
  }
  if (sl.includes('keywords is not null')) return store.reviews.filter(r=>r.user_id===uid && r.keywords);
  if (sl.includes('substring(review_date')) {
    const months = {};
    store.reviews.filter(r=>r.user_id===uid).forEach(r => {
      const month = r.review_date ? r.review_date.substring(0,7) : '2024-01';
      if(!months[month]) months[month]={month,count:0,total_rating:0,positive:0};
      months[month].count++; months[month].total_rating+=r.rating;
      if(r.sentiment==='positive') months[month].positive++;
    });
    return Object.values(months).map(m=>({month:m.month,count:m.count,avg_rating:m.total_rating/m.count,positive:m.positive})).sort((a,b)=>a.month.localeCompare(b.month)).slice(-12);
  }
  return [];
}

function memRun(sql, params) {
  const sl = sql.toLowerCase();
  if (sl.startsWith('insert into users')) {
    store.users.push({id:params[0],name:params[1],email:params[2],password_hash:params[3],business_name:params[4]||null,business_type:params[5]||null,plan:'free',subscription_status:'inactive',created_at:now(),updated_at:now()});
    return { changes: 1 };
  }
  if (sl.startsWith('insert into reviews')) {
    store.reviews.push({id:params[0],user_id:params[1],platform:params[2],reviewer_name:params[3],rating:parseInt(params[4]),review_text:params[5],review_date:params[6],sentiment:params[7],sentiment_score:params[8],keywords:params[9],response_status:params[10]||'pending',source:params[11]||'manual',ai_response:null,created_at:now()});
    return { changes: 1 };
  }
  if (sl.startsWith('update users') && sl.includes('set plan')) { const u=store.users.find(u=>u.id===params[params.length-1]); if(u){u.plan=params[0];u.subscription_status=params[1]||'active';} return {changes:1}; }
  if (sl.startsWith('update users') && sl.includes('set name')) { const u=store.users.find(u=>u.id===params[params.length-1]); if(u){u.name=params[0];u.business_name=params[1];u.business_type=params[2];} return {changes:1}; }
  if (sl.startsWith('update reviews') && sl.includes('ai_response')) { const r=store.reviews.find(r=>r.id===params[params.length-1]); if(r){r.ai_response=params[0];r.response_status='generated';} return {changes:1}; }
  if (sl.startsWith('update reviews') && sl.includes('responded')) { const r=store.reviews.find(r=>r.id===params[params.length-1]); if(r){r.response_status='responded';r.responded_at=now();if(params[0])r.ai_response=params[0];} return {changes:1}; }
  if (sl.startsWith('delete from reviews')) { store.reviews=store.reviews.filter(r=>r.id!==params[0]); return {changes:1}; }
  return { changes: 0 };
}

const db = {
  async asyncGet(sql, params = []) {
    try { if (pool) return await pgGet(sql, params); } catch(e) { console.error('pgGet error:', e.message); }
    return memGet(sql, params);
  },
  async asyncAll(sql, params = []) {
    try { if (pool) return await pgAll(sql, params); } catch(e) { console.error('pgAll error:', e.message); return []; }
    return memAll(sql, params);
  },
  async asyncRun(sql, params = []) {
    try { if (pool) return await pgRun(sql, params); } catch(e) { console.error('pgRun error:', e.message); }
    return memRun(sql, params);
  },
  _store: store,
  pool
};

module.exports = db;

