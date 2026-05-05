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
  'sentry.io','example.com','test.com','domain.com','aol.com','me.com','live.com']);

const JUNK_PREFIXES = ['noreply','no-reply','donotreply','privacy','legal','abuse','postmaster','mailer','webmaster','admin'];

// Bounding boxes: [south, west, north, east]
const CITIES = [
  { name: 'Seattle', state: 'WA', box: [47.48,-122.51,47.80,-122.22] },
  { name: 'Portland', state: 'OR', box: [45.42,-122.86,45.65,-122.50] },
  { name: 'Denver', state: 'CO', box: [39.61,-105.12,39.86,-104.79] },
  { name: 'Phoenix', state: 'AZ', box: [33.28,-112.33,33.65,-111.88] },
  { name: 'San Diego', state: 'CA', box: [32.58,-117.30,32.96,-116.98] },
  { name: 'Minneapolis', state: 'MN', box: [44.88,-93.40,45.05,-93.19] },
  { name: 'Atlanta', state: 'GA', box: [33.64,-84.56,33.89,-84.28] },
  { name: 'Boston', state: 'MA', box: [42.22,-71.19,42.40,-70.99] },
  { name: 'Miami', state: 'FL', box: [25.70,-80.33,25.88,-80.12] },
  { name: 'Charlotte', state: 'NC', box: [35.10,-81.00,35.34,-80.74] },
  { name: 'Tampa', state: 'FL', box: [27.85,-82.58,28.08,-82.38] },
  { name: 'Nashville', state: 'TN', box: [36.04,-87.06,36.27,-86.65] },
  { name: 'Indianapolis', state: 'IN', box: [39.63,-86.33,39.93,-85.97] },
  { name: 'Columbus', state: 'OH', box: [39.88,-83.12,40.16,-82.84] },
  { name: 'Louisville', state: 'KY', box: [38.10,-85.93,38.37,-85.62] },
  { name: 'Sacramento', state: 'CA', box: [38.44,-121.57,38.70,-121.35] },
  { name: 'Las Vegas', state: 'NV', box: [36.08,-115.38,36.32,-115.07] },
  { name: 'Salt Lake City', state: 'UT', box: [40.69,-112.02,40.81,-111.82] },
  { name: 'Albuquerque', state: 'NM', box: [35.00,-106.80,35.23,-106.50] },
  { name: 'Raleigh', state: 'NC', box: [35.71,-78.78,35.90,-78.54] },
  { name: 'Pittsburgh', state: 'PA', box: [40.35,-80.10,40.50,-79.87] },
  { name: 'Cincinnati', state: 'OH', box: [39.07,-84.66,39.21,-84.42] },
  { name: 'Kansas City', state: 'MO', box: [38.95,-94.73,39.18,-94.42] },
  { name: 'Milwaukee', state: 'WI', box: [42.92,-88.07,43.13,-87.86] },
  { name: 'Memphis', state: 'TN', box: [35.02,-90.10,35.22,-89.85] },
  { name: 'Baltimore', state: 'MD', box: [39.19,-76.72,39.38,-76.52] },
  { name: 'Austin', state: 'TX', box: [30.17,-97.85,30.52,-97.63] },
  { name: 'Fort Worth', state: 'TX', box: [32.62,-97.50,32.90,-97.25] },
  { name: 'Oklahoma City', state: 'OK', box: [35.36,-97.59,35.58,-97.38] },
  { name: 'Omaha', state: 'NE', box: [41.19,-96.21,41.39,-95.91] },
  { name: 'Fresno', state: 'CA', box: [36.68,-119.89,36.88,-119.69] },
  { name: 'Tucson', state: 'AZ', box: [32.13,-111.11,32.33,-110.83] },
  { name: 'Richmond', state: 'VA', box: [37.47,-77.56,37.63,-77.37] },
  { name: 'New Orleans', state: 'LA', box: [29.90,-90.15,30.08,-89.96] },
  { name: 'Baton Rouge', state: 'LA', box: [30.36,-91.22,30.51,-91.07] },
  { name: 'Birmingham', state: 'AL', box: [33.43,-86.93,33.59,-86.72] },
  { name: 'Jacksonville', state: 'FL', box: [30.15,-81.80,30.45,-81.52] },
  { name: 'Orlando', state: 'FL', box: [28.40,-81.55,28.63,-81.30] },
  { name: 'Spokane', state: 'WA', box: [47.57,-117.54,47.72,-117.32] },
  { name: 'Boise', state: 'ID', box: [43.55,-116.30,43.70,-116.14] },
];

const AMENITIES = [
  'restaurant','cafe','bar','hotel','spa','beauty','hair_care',
  'fast_food','bakery','ice_cream','pub'
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchHttp(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error('too many redirects'));
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Accept': 'text/html,*/*;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 10000
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location;
          let next;
          try { next = loc.startsWith('http') ? loc : new URL(loc, url).href; } catch { return reject(new Error('bad redirect')); }
          res.resume();
          return fetchHttp(next, redirects + 1).then(resolve).catch(reject);
        }
        let data = '';
        res.on('data', c => { data += c; if (data.length > 300000) { req.destroy(); resolve({ status: res.statusCode, body: data }); } });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    } catch(e) { reject(e); }
  });
}

function extractEmail(html, domain) {
  const rx = /\b([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,6})\b/gi;
  const emails = new Set();
  let m;
  while ((m = rx.exec(html)) !== null) emails.add(m[1].toLowerCase());

  const filtered = [...emails].filter(e => {
    const [local, dom] = e.split('@');
    if (!dom) return false;
    if (JUNK_DOMAINS.has(dom)) return false;
    if (JUNK_PREFIXES.some(p => local.startsWith(p))) return false;
    if (/\.(png|jpg|gif|css|js|svg|woff|ttf)$/i.test(e)) return false;
    if (e.includes('..') || e.length > 80) return false;
    return true;
  });

  const same = filtered.filter(e => e.split('@')[1].includes(domain));
  return same[0] || filtered[0] || null;
}

async function getEmailFromSite(siteUrl) {
  let origin, domain;
  try {
    const u = new URL(siteUrl.startsWith('http') ? siteUrl : 'https://' + siteUrl);
    origin = u.origin;
    domain = u.hostname.replace(/^www\./, '');
  } catch { return null; }

  for (const path of ['', '/contact', '/contact-us', '/about', '/about-us']) {
    try {
      const res = await fetchHttp(origin + path + (path ? '' : '/'));
      if (res.status === 200) {
        const email = extractEmail(res.body, domain);
        if (email) return email;
      }
      await delay(300);
    } catch { await delay(200); }
  }
  return null;
}

async function queryOverpass(city, amenityList) {
  const [s, w, n, e] = city.box;
  const amenityFilter = amenityList.map(a => `["amenity"="${a}"]`);
  const nodes = amenityList.map(a =>
    `node["amenity"="${a}"]["website"](${s},${w},${n},${e});`
  ).join('\n  ');

  const query = `[out:json][timeout:30];\n(\n  ${nodes}\n);\nout 200;`;
  const postData = 'data=' + encodeURIComponent(query);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'overpass-api.de',
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'ReplyPilot-leadgen/1.0'
      },
      timeout: 35000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve([]);
        try {
          const parsed = JSON.parse(d);
          resolve(parsed.elements || []);
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.write(postData);
    req.end();
  });
}

function buildEmail(bizName, city) {
  const cityName = city.split(',')[0];
  return {
    from: 'Chris from ReplyPilot <noreply@reply-pilot.net>',
    reply_to: 'Christophersw1011@gmail.com',
    subject: `Manage your ${cityName} reviews with AI — free to start`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#222;line-height:1.6">
<p>Hi${bizName ? ' ' + bizName + ' team' : ' there'},</p>
<p>I'm Chris, founder of <strong>ReplyPilot</strong> — an AI tool that helps local businesses manage online reviews without spending hours doing it manually.</p>
<p>Here's what it does:</p>
<ul>
<li>📊 <strong>Analyzes every review</strong> with sentiment scoring (Google, Yelp & more)</li>
<li>✍️ <strong>Generates professional responses</strong> in one click — sounds like you, not a bot</li>
<li>🔔 <strong>Alerts you</strong> the moment a new review comes in</li>
<li>📈 <strong>Tracks rating trends</strong> over time so you can spot what's working</li>
</ul>
<p>Businesses using ReplyPilot typically save 2–3 hours per week and see higher review engagement.</p>
<p>You can start <strong>completely free</strong> — no credit card needed:<br>
👉 <a href="https://reply-pilot.net/register.html">https://reply-pilot.net/register.html</a></p>
<p>Happy to answer any questions — just reply here.</p>
<p>Best,<br>Chris<br>Founder, ReplyPilot<br><a href="https://reply-pilot.net">reply-pilot.net</a></p>
<p style="font-size:11px;color:#999;margin-top:24px">You're receiving this because your business appears in local listings. Reply "unsubscribe" to opt out.</p>
</div>`
  };
}

async function main() {
  console.log('OSM-based lead gen + email send');
  console.log('Resend key:', RESEND_KEY ? RESEND_KEY.slice(0, 12) + '...' : 'MISSING');
  console.log('Already sent:', sentSet.size, 'addresses\n');

  const TARGET = 500;
  let totalSent = 0;

  for (const city of CITIES) {
    if (totalSent >= TARGET) break;
    console.log(`\nCity: ${city.name}, ${city.state}`);

    let elements = [];
    try {
      elements = await queryOverpass(city, AMENITIES);
      console.log(`  OSM returned ${elements.length} businesses with websites`);
    } catch(e) {
      console.log(`  Overpass error: ${e.message}`);
    }

    await delay(2000); // respectful delay between Overpass queries

    for (const el of elements) {
      if (totalSent >= TARGET) break;
      const tags = el.tags || {};
      const website = tags.website || tags['contact:website'];
      if (!website) continue;

      const bizName = tags.name || '';

      let email = null;
      try {
        email = await getEmailFromSite(website);
      } catch {}

      if (!email) continue;
      if (sentSet.has(email)) { console.log(`  SKIP: ${email}`); continue; }

      sentSet.add(email);
      try {
        const msg = buildEmail(bizName, `${city.name}, ${city.state}`);
        msg.to = email;
        await resend.emails.send(msg);
        batchSent.push(email);
        totalSent++;
        console.log(`  [${totalSent}] SENT → ${email} (${bizName})`);
        fs.appendFileSync(SENT_FILE, email + '\n');
        await delay(300);
      } catch(e) {
        console.log(`  FAIL: ${e.message}`);
      }
    }
  }

  if (batchSent.length > 0) {
    fs.writeFileSync(BATCH_OUT, batchSent.join('\n') + '\n');
    console.log(`\nSaved ${batchSent.length} sent addresses → ${BATCH_OUT}`);
  }
  console.log(`\nDone. Total sent: ${totalSent}`);
}

main().catch(console.error);
