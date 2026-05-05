process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const cs = process.env.POSTGRES_CONNECTION_STRING || process.env.DATABASE_URL || process.env.DB_URL || 'postgresql://postgres:YvfUImpZUcFrKkfoRaavEcaHbFzzIkXT@roundhouse.proxy.rlwy.net:20346/railway';
if (!cs) { console.error('No connection string found'); process.exit(1); }

const pool = new Pool({ connectionString: cs });

async function run() {
  // All users
  const users = await pool.query(
    "SELECT id, name, email, plan, created_at FROM users ORDER BY created_at DESC"
  );
  console.log('\n=== USERS (' + users.rows.length + ' total) ===');
  users.rows.forEach(u => {
    console.log('  ' + u.email + ' | plan: ' + u.plan + ' | joined: ' + (u.created_at ? String(u.created_at).split('T')[0] : 'unknown'));
  });

  // Review activity per user
  const activity = await pool.query(
    "SELECT u.email, u.name, COUNT(r.id) as review_count, MAX(r.created_at) as last_review, SUM(CASE WHEN r.ai_response IS NOT NULL THEN 1 ELSE 0 END) as ai_used FROM users u LEFT JOIN reviews r ON r.user_id = u.id GROUP BY u.id, u.email, u.name ORDER BY review_count DESC"
  );
  console.log('\n=== ACTIVITY ===');
  activity.rows.forEach(a => {
    console.log('  ' + a.email + ' | reviews: ' + a.review_count + ' | ai used: ' + a.ai_used + ' | last review: ' + (a.last_review ? String(a.last_review).split('T')[0] : 'none'));
  });

  // Recent AI generations
  const gens = await pool.query(
    "SELECT u.email, COUNT(*) as count FROM ai_generations g JOIN users u ON u.id = g.user_id GROUP BY u.email"
  );
  console.log('\n=== AI GENERATIONS ===');
  gens.rows.forEach(g => console.log('  ' + g.email + ': ' + g.count + ' total'));

  await pool.end();
}

run().catch(e => { console.error('Error:', e.message); pool.end(); });
