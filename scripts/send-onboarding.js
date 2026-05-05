const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  connectionString: 'postgresql://postgres:YvfUImpZUcFrKkfoRaavEcaHbFzzIkXT@roundhouse.proxy.rlwy.net:20346/railway',
  ssl: { rejectUnauthorized: false }
});

const BASE_URL = 'https://www.reply-pilot.net';
const EXCLUDE = ['christophersw1011@gmail.com', 'tophersw101105@gmail.com', 'rpcs@reply-pilot.net'];

function onboardingEmail(name) {
  const first = name.split(' ')[0];
  return `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#FAF8F4;padding:40px 32px;border-radius:12px">
    <div style="font-family:Georgia,serif;font-size:26px;font-weight:800;color:#0A0A0F;margin-bottom:24px">Reply<span style="color:#E8922A">Pilot</span></div>
    <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:800;color:#0A0A0F;margin-bottom:12px">You're in — here's how to get your first AI response.</h1>
    <p style="font-size:15px;color:#6B6878;line-height:1.7;margin-bottom:24px">Hi ${first}, your account is set up. It only takes about 2 minutes to generate your first professional review reply. Here's how:</p>

    <div style="background:white;border-radius:8px;padding:20px 24px;margin-bottom:12px;border-left:3px solid #E8922A">
      <p style="font-size:14px;font-weight:700;color:#0A0A0F;margin:0 0 4px">① Add a review</p>
      <p style="font-size:14px;color:#6B6878;margin:0;line-height:1.6">Go to your dashboard and click <strong>Add Review</strong>. Paste in any review from Google, Yelp, or anywhere else.</p>
    </div>

    <div style="background:white;border-radius:8px;padding:20px 24px;margin-bottom:12px;border-left:3px solid #E8922A">
      <p style="font-size:14px;font-weight:700;color:#0A0A0F;margin:0 0 4px">② Generate a response</p>
      <p style="font-size:14px;color:#6B6878;margin:0;line-height:1.6">Hit <strong>Generate AI Response</strong>. ReplyPilot reads the review, scores the sentiment, and writes a professional reply tailored to the tone — positive, negative, or neutral.</p>
    </div>

    <div style="background:white;border-radius:8px;padding:20px 24px;margin-bottom:28px;border-left:3px solid #E8922A">
      <p style="font-size:14px;font-weight:700;color:#0A0A0F;margin:0 0 4px">③ Copy and post it</p>
      <p style="font-size:14px;color:#6B6878;margin:0;line-height:1.6">Copy the response and paste it back on Google or Yelp. Takes 30 seconds.</p>
    </div>

    <a href="${BASE_URL}/dashboard.html" style="display:inline-block;background:#0A0A0F;color:white;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;margin-bottom:32px">Go to Dashboard →</a>

    <hr style="border:none;border-top:1px solid #E8E4DC;margin-bottom:24px">
    <p style="font-size:13px;color:#6B6878;line-height:1.6">Questions? Just reply to this email — we read every one.</p>
    <p style="font-size:12px;color:#9CA3AF;margin-top:24px">© 2025 ReplyPilot · <a href="${BASE_URL}/privacy.html" style="color:#9CA3AF">Privacy</a> · <a href="${BASE_URL}/terms.html" style="color:#9CA3AF">Terms</a></p>
  </div>`;
}

async function sendEmail(to, name) {
  const apiKey = process.env.RESEND_API_KEY;
  try {
    const res = await axios.post('https://api.resend.com/emails',
      {
        from: 'ReplyPilot <noreply@reply-pilot.net>',
        to: [to],
        subject: 'Get started with ReplyPilot — here\'s how',
        html: onboardingEmail(name)
      },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );
    return { ok: true, id: res.data.id };
  } catch (e) {
    return { ok: false, error: e.response?.data || e.message };
  }
}

async function main() {
  const { rows } = await pool.query(
    `SELECT name, email FROM users WHERE email != ALL($1) ORDER BY created_at ASC`,
    [EXCLUDE]
  );

  console.log(`Sending to ${rows.length} users...\n`);

  for (const user of rows) {
    const result = await sendEmail(user.email, user.name);
    if (result.ok) {
      console.log(`✓ ${user.name} <${user.email}>`);
    } else {
      console.log(`✗ ${user.name} <${user.email}> — ${JSON.stringify(result.error)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\nDone.');
  pool.end();
}

main().catch(e => { console.error(e.message); pool.end(); });
