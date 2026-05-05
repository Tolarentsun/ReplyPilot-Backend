const https = require('https');
const http = require('http');
const fs = require('fs');
const { Resend } = require('resend');

const BASE = 'C:/Users/chris/AppData/Local/Temp/ReplyPilot-Backend/';
const SENT_FILE = BASE + 'sent-emails.txt';
const BATCH_OUT = BASE + 'sent-batch5-2026-05-03.txt';

const sentSet = new Set(fs.readFileSync(SENT_FILE, 'utf8').toLowerCase().split('\n').map(e => e.trim()).filter(Boolean));
const batchSent = [];

const RESEND_KEY = process.env.RESEND_API_KEY;
const resend = new Resend(RESEND_KEY);

const JUNK_DOMAINS = new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
  'squarespace.com','wix.com','godaddy.com','wordpress.com','twitter.com','facebook.com',
  'instagram.com','yelp.com','tripadvisor.com','google.com','apple.com','microsoft.com',
  'sentry.io','example.com','test.com','domain.com']);

const JUNK_PREFIXES = ['noreply','no-reply','donotreply','privacy','legal','abuse','postmaster','mailer'];

const CATEGORIES = [
  'restaurant','hotel','spa','hair salon','auto repair shop','dentist',
  'gym','coffee shop','bakery','nail salon','pizza restaurant','sushi restaurant',
  'mexican restaurant','italian restaurant','bar and grill'
];

const CITIES = [
  'Seattle WA','Portland OR','Denver CO','Phoenix AZ','San Diego CA',
  'Minneapolis MN','Atlanta GA','Boston MA','Miami FL','Charlotte NC',
  'Tampa FL','Nashville TN','Indianapolis IN','Columbus OH','Louisville KY',
  'Sacramento CA','Las Vegas NV','Salt Lake City UT','Albuquerque NM','Tucson AZ',
  'Raleigh NC','Richmond VA','Pittsburgh PA','Cincinnati OH','Kansas City MO',
  'Milwaukee WI','Memphis TN','Baltimore MD','Austin TX','Fort Worth TX',
  'El Paso TX','Oklahoma City OK','Omaha NE','Tulsa OK','Fresno CA'
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchHttp(url, opts = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(opts.headers || {})
        },
        timeout: 10000
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location;
          let nextUrl;
          try { nextUrl = loc.startsWith('http') ? loc : new URL(loc, url).href; } catch { return reject(new Error('bad redirect')); }
          res.resume();
          return fetchHttp(nextUrl, opts, redirects + 1).then(resolve).catch(reject);
        }
        let data = '';
        res.on('data', c => { data += c; if (data.length > 500000) { req.destroy(); resolve({ status: res.statusCode, body: data }); } });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    } catch(e) { reject(e); }
  });
}

function extractEmails(html, preferDomain) {
  const emails = new Set();
  const rx = /\b([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,6})\b/gi;
  let m;
  while ((m = rx.exec(html)) !== null) emails.add(m[1].toLowerCase());

  const filtered = [...emails].filter(e => {
    const [local, domain] = e.split('@');
    if (!domain) return false;
    if (JUNK_DOMAINS.has(domain)) return false;
    if (JUNK_PREFIXES.some(p => local.startsWith(p))) return false;
    if (e.includes('..') || e.endsWith('.')) return false;
    if (/\.(png|jpg|gif|css|js|svg|woff)$/i.test(e)) return false;
    return true;
  });

  if (preferDomain) {
    const same = filtered.filter(e => e.split('@')[1].includes(preferDomain));
    if (same.length) return same[0];
  }
  return filtered[0] || null;
}

async function scrapeWebsiteForEmail(siteUrl) {
  let origin;
  let domain;
  try {
    const u = new URL(siteUrl);
    origin = u.origin;
    domain = u.hostname.replace(/^www\./, '');
  } catch { return null; }

  const pages = [origin + '/', origin + '/contact', origin + '/contact-us', origin + '/about'];

  for (const page of pages) {
    try {
      const res = await fetchHttp(page);
      if (res.status === 200) {
        const email = extractEmails(res.body, domain);
        if (email) return email;
      }
      await delay(400);
    } catch { await delay(400); }
  }
  return null;
}

async function ddgSearch(query) {
  const urls = [];
  try {
    const encoded = encodeURIComponent(query);
    const res = await fetchHttp(`https://html.duckduckgo.com/html/?q=${encoded}`, {
      headers: { 'Cookie': 'kl=us-en' }
    });
    if (res.status !== 200) return urls;

    const rx = /uddg=([^&"]+)/g;
    let m;
    while ((m = rx.exec(res.body)) !== null) {
      try {
        const decoded = decodeURIComponent(m[1]);
        if (decoded.startsWith('http') && !decoded.includes('duckduckgo.com')) {
          urls.push(decoded);
        }
      } catch {}
    }
  } catch {}
  return [...new Set(urls)].slice(0, 8);
}

function buildEmail(bizName, city) {
  return {
    from: 'Chris from ReplyPilot <noreply@reply-pilot.net>',
    reply_to: 'Christophersw1011@gmail.com',
    subject: `Manage your ${city.split(' ')[0]} reviews with AI — free to start`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#222;line-height:1.6">
<p>Hi${bizName ? ' ' + bizName + ' team' : ''},</p>
<p>I'm Chris, founder of <strong>ReplyPilot</strong> — an AI tool built for local businesses to manage online reviews without spending hours on it.</p>
<p>Here's what it does:</p>
<ul>
<li>📊 <strong>Analyzes every review</strong> with sentiment scoring (Google, Yelp & more)</li>
<li>✍️ <strong>Generates professional replies</strong> in one click — sounds human, not robotic</li>
<li>🔔 <strong>Alerts you</strong> when new reviews come in so nothing slips</li>
<li>📈 <strong>Tracks your rating trends</strong> so you can see what's working</li>
</ul>
<p>Businesses using ReplyPilot save 2–3 hours per week and see noticeably better engagement with reviewers.</p>
<p>You can try it <strong>completely free</strong> — no credit card:<br>
👉 <a href="https://reply-pilot.net/register.html">https://reply-pilot.net/register.html</a></p>
<p>Happy to answer any questions — just reply to this email.</p>
<p>Best,<br>Chris<br>Founder, ReplyPilot<br><a href="https://reply-pilot.net">reply-pilot.net</a></p>
<p style="font-size:11px;color:#999;margin-top:24px">You're receiving this because your business appears in local search results. Reply "unsubscribe" to opt out.</p>
</div>`
  };
}

async function main() {
  console.log('DDG-based lead gen + send');
  console.log('Resend key:', RESEND_KEY ? RESEND_KEY.slice(0, 12) + '...' : 'MISSING');
  console.log('Already sent:', sentSet.size, 'emails\n');

  let totalSent = 0;
  const TARGET = 400;

  for (const city of CITIES) {
    if (totalSent >= TARGET) break;

    for (const cat of CATEGORIES) {
      if (totalSent >= TARGET) break;

      const query = `${cat} ${city}`;
      console.log(`Searching: "${query}"`);

      const urls = await ddgSearch(query);
      console.log(`  Found ${urls.length} URLs`);

      await delay(1200); // don't hammer DDG

      for (const siteUrl of urls) {
        if (totalSent >= TARGET) break;
        // Skip social/directory sites
        if (/yelp|tripadvisor|facebook|instagram|google|bing|yellowpages|mapquest|opentable|doordash|grubhub|ubereats|zomato|foursquare/.test(siteUrl)) continue;

        let email = null;
        try {
          email = await scrapeWebsiteForEmail(siteUrl);
        } catch {}

        if (!email) continue;
        if (sentSet.has(email)) { console.log(`  SKIP: ${email}`); continue; }

        sentSet.add(email);

        // Guess business name from URL
        let bizName = '';
        try { bizName = new URL(siteUrl).hostname.replace(/^www\./,'').split('.')[0].replace(/-/g,' '); } catch {}

        try {
          const msg = buildEmail(bizName, city);
          msg.to = email;
          await resend.emails.send(msg);
          batchSent.push(email);
          totalSent++;
          console.log(`  [${totalSent}] SENT → ${email} (${siteUrl.slice(0, 50)})`);
          fs.appendFileSync(SENT_FILE, email + '\n');
          await delay(350);
        } catch (e) {
          console.log(`  FAIL: ${e.message}`);
        }
      }
    }
  }

  if (batchSent.length > 0) {
    fs.writeFileSync(BATCH_OUT, batchSent.join('\n') + '\n');
    console.log(`\nSaved ${batchSent.length} addresses → ${BATCH_OUT}`);
  }
  console.log(`\nDone. Sent: ${totalSent}`);
}

main().catch(console.error);
