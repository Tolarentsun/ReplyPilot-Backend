// Pure JS in-memory database — no native dependencies, works everywhere
// Data persists for the lifetime of the server process

const store = {
  users: [],
  reviews: [],
  ai_generations: []
};

const now = () => new Date().toISOString();
const dateStr = () => new Date().toISOString().split('T')[0];

// Mimic better-sqlite3 synchronous API
const db = {
  _store: store,

  prepare(sql) {
    const s = sql.trim();
    const sl = s.toLowerCase();

    return {
      // INSERT / UPDATE / DELETE
      run(...params) {
        // INSERT INTO users
        if (sl.startsWith('insert into users')) {
          store.users.push({
            id: params[0], name: params[1], email: params[2],
            password_hash: params[3], business_name: params[4] || null,
            business_type: params[5] || null, plan: params[6] || 'free',
            stripe_customer_id: null, stripe_subscription_id: null,
            subscription_status: 'inactive', subscription_ends_at: null,
            created_at: now(), updated_at: now()
          });
          return { changes: 1 };
        }

        // INSERT INTO reviews
        if (sl.startsWith('insert into reviews')) {
          store.reviews.push({
            id: params[0], user_id: params[1], platform: params[2],
            reviewer_name: params[3], rating: parseInt(params[4]),
            review_text: params[5], review_date: params[6],
            sentiment: params[7], sentiment_score: params[8],
            keywords: params[9], response_status: params[10] || 'pending',
            source: params[11] || 'manual', ai_response: null,
            responded_at: null, created_at: now()
          });
          return { changes: 1 };
        }

        // INSERT INTO ai_generations
        if (sl.startsWith('insert into ai_generations')) {
          store.ai_generations.push({
            id: params[0], user_id: params[1], review_id: params[2],
            prompt: params[3], response: params[4], model: params[5],
            created_at: now()
          });
          return { changes: 1 };
        }

        // UPDATE users SET plan
        if (sl.startsWith('update users') && sl.includes('set plan')) {
          const u = store.users.find(u => u.id === params[params.length - 1]);
          if (u) { u.plan = params[0]; u.subscription_status = params[1] || 'active'; u.subscription_ends_at = params[2] || null; u.updated_at = now(); }
          return { changes: 1 };
        }

        // UPDATE users SET name
        if (sl.startsWith('update users') && sl.includes('set name')) {
          const u = store.users.find(u => u.id === params[params.length - 1]);
          if (u) { u.name = params[0]; u.business_name = params[1]; u.business_type = params[2]; u.updated_at = now(); }
          return { changes: 1 };
        }

        // UPDATE users SET stripe_customer_id
        if (sl.startsWith('update users') && sl.includes('stripe_customer_id')) {
          const u = store.users.find(u => u.id === params[1]);
          if (u) { u.stripe_customer_id = params[0]; }
          return { changes: 1 };
        }

        // UPDATE reviews SET ai_response
        if (sl.startsWith('update reviews') && sl.includes('ai_response')) {
          const r = store.reviews.find(r => r.id === params[params.length - 1]);
          if (r) { r.ai_response = params[0]; r.response_status = 'generated'; }
          return { changes: 1 };
        }

        // UPDATE reviews SET response_status = 'responded'
        if (sl.startsWith('update reviews') && sl.includes('responded')) {
          const r = store.reviews.find(r => r.id === params[params.length - 1]);
          if (r) { r.response_status = 'responded'; r.responded_at = now(); if (params[0]) r.ai_response = params[0]; }
          return { changes: 1 };
        }

        // DELETE FROM reviews
        if (sl.startsWith('delete from reviews')) {
          const before = store.reviews.length;
          store.reviews = store.reviews.filter(r => r.id !== params[0]);
          return { changes: before - store.reviews.length };
        }

        return { changes: 0 };
      },

      // SELECT single row
      get(...params) {
        // SELECT * FROM users WHERE id = ?
        if (sl.includes('from users where id')) return store.users.find(u => u.id === params[0]) || null;

        // SELECT * FROM users WHERE email = ?
        if (sl.includes('from users where email')) return store.users.find(u => u.email === params[0]) || null;

        // SELECT id FROM users WHERE email = ?
        if (sl.includes('select id from users')) return store.users.find(u => u.email === params[0]) || null;

        // SELECT * FROM reviews WHERE id = ? AND user_id = ?
        if (sl.includes('from reviews where id') && params.length >= 2) {
          return store.reviews.find(r => r.id === params[0] && r.user_id === params[1]) || null;
        }
        if (sl.includes('from reviews where id')) {
          return store.reviews.find(r => r.id === params[0]) || null;
        }

        // Analytics aggregate query
        if (sl.includes('count(*)') || sl.includes('avg(rating)')) {
          const uid = params[0];
          const reviews = store.reviews.filter(r => r.user_id === uid);
          const total = reviews.length;
          const avg_rating = total ? reviews.reduce((a, r) => a + r.rating, 0) / total : 0;
          const positive_count = reviews.filter(r => r.sentiment === 'positive').length;
          const negative_count = reviews.filter(r => r.sentiment === 'negative').length;
          const neutral_count = reviews.filter(r => r.sentiment === 'neutral').length;
          const responded_count = reviews.filter(r => r.response_status === 'responded').length;
          const pending_count = reviews.filter(r => r.response_status === 'pending').length;
          // COUNT(*) as total for pagination
          if (sl.includes('count(*) as total') && !sl.includes('avg')) return { total };
          return { total_reviews: total, avg_rating, positive_count, negative_count, neutral_count, responded_count, pending_count };
        }

        return null;
      },

      // SELECT multiple rows
      all(...params) {
        const uid = params[0];

        if (sl.includes('from reviews')) {
          let results = store.reviews.filter(r => r.user_id === uid);

          // Apply sentiment filter
          if (sl.includes("sentiment = '") || (params[1] && !['all', undefined].includes(params[1]))) {
            const sentMatch = sl.match(/sentiment = '(\w+)'/);
            if (sentMatch) results = results.filter(r => r.sentiment === sentMatch[1]);
          }

          // Apply rating filter
          const ratingMatch = sl.match(/rating = (\d)/);
          if (ratingMatch) results = results.filter(r => r.rating === parseInt(ratingMatch[1]));

          // Apply platform filter
          const platMatch = sl.match(/platform = '(\w+)'/);
          if (platMatch) results = results.filter(r => r.platform === platMatch[1]);

          // Sort
          if (sl.includes('order by review_date desc')) results.sort((a, b) => b.review_date.localeCompare(a.review_date));
          else if (sl.includes('order by review_date asc')) results.sort((a, b) => a.review_date.localeCompare(b.review_date));
          else if (sl.includes('order by rating desc')) results.sort((a, b) => b.rating - a.rating);
          else if (sl.includes('order by rating asc')) results.sort((a, b) => a.rating - b.rating);
          else results.sort((a, b) => b.review_date.localeCompare(a.review_date));

          // Limit / offset
          const limitMatch = sl.match(/limit (\d+)/);
          const offsetMatch = sl.match(/offset (\d+)/);
          const offset = offsetMatch ? parseInt(offsetMatch[1]) : 0;
          const limit = limitMatch ? parseInt(limitMatch[1]) : 50;
          results = results.slice(offset, offset + limit);

          return results;
        }

        // Rating distribution
        if (sl.includes('group by rating')) {
          const reviews = store.reviews.filter(r => r.user_id === uid);
          const dist = {};
          reviews.forEach(r => { dist[r.rating] = (dist[r.rating] || 0) + 1; });
          return Object.entries(dist).map(([rating, count]) => ({ rating: parseInt(rating), count })).sort((a, b) => b.rating - a.rating);
        }

        // Platform distribution
        if (sl.includes('group by platform')) {
          const reviews = store.reviews.filter(r => r.user_id === uid);
          const dist = {};
          reviews.forEach(r => {
            if (!dist[r.platform]) dist[r.platform] = { platform: r.platform, count: 0, total_rating: 0 };
            dist[r.platform].count++;
            dist[r.platform].total_rating += r.rating;
          });
          return Object.values(dist).map(d => ({ platform: d.platform, count: d.count, avg_rating: d.total_rating / d.count }));
        }

        // Monthly trend
        if (sl.includes("strftime('%y-%m'") || sl.includes("strftime('%Y-%m'")) {
          const reviews = store.reviews.filter(r => r.user_id === uid);
          const months = {};
          reviews.forEach(r => {
            const month = r.review_date ? r.review_date.substring(0, 7) : '2024-01';
            if (!months[month]) months[month] = { month, count: 0, total_rating: 0, positive: 0 };
            months[month].count++;
            months[month].total_rating += r.rating;
            if (r.sentiment === 'positive') months[month].positive++;
          });
          return Object.values(months)
            .map(m => ({ month: m.month, count: m.count, avg_rating: m.total_rating / m.count, positive: m.positive }))
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-12);
        }

        // Keywords
        if (sl.includes('keywords is not null')) {
          return store.reviews.filter(r => r.user_id === uid && r.keywords);
        }

        if (sl.includes('from users')) return store.users;
        return [];
      }
    };
  },

  exec() { return this; },
  pragma() { return this; },
  transaction(fn) { return (...args) => fn(...args); }
};

console.log('✅ In-memory database ready');
module.exports = db;
