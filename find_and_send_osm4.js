/**
 * OSM v4: new cities, updated professional email template
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const { Resend } = require('resend');

const BASE = 'C:/Users/chris/AppData/Local/Temp/ReplyPilot-Backend/';
const SENT_FILE = BASE + 'sent-emails.txt';
const BATCH_OUT = BASE + 'sent-batch7-2026-05-05.txt';

const sentSet = new Set(fs.readFileSync(SENT_FILE, 'utf8').toLowerCase().split('\n').map(e => e.trim()).filter(Boolean));
const batchSent = [];

const RESEND_KEY = process.env.RESEND_API_KEY;
const resend = new Resend(RESEND_KEY);

const JUNK_DOMAINS = new Set([
  'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','aol.com','me.com','live.com',
  'squarespace.com','wix.com','godaddy.com','wordpress.com','twitter.com','facebook.com',
  'instagram.com','yelp.com','tripadvisor.com','google.com','apple.com','microsoft.com',
  'sentry.io','example.com','test.com','domain.com','caesars.com','hilton.com','marriott.com',
  'hyatt.com','ihg.com','wyndham.com','bestwestern.com','choicehotels.com','extendedstayamerica.com',
  'druryhotels.com','economyhotelusa.com','starbucks.com','subway.com','mcdonalds.com','dunkindonuts.com',
  'dominos.com','pizzahut.com','panera.com','chipotle.com','olivegarden.com','chilis.com',
  'applebees.com','dennys.com','ihop.com','circalasvegas.com','wixpress.com','mystore.com',
  'wholefoods.com','safeway.com','kroger.com','costco.com','target.com','walmart.com',
  'ingest.us.sentry.io','ingest.sentry.io','gist-apps.com','meltingpot.com','anthonys.com',
  'mcmenamins.com','cactusrestaurants.com','matadorrestaurants.com','dukesseafood.com'
]);

const JUNK_PREFIXES = ['noreply','no-reply','donotreply','privacy','legal','abuse','postmaster',
  'mailer','press','bounce','unsubscribe','marketing','info@starbucks','wfm.alumni'];

// Cities NOT covered in v1/v2/v3 (Seattle, Portland, + 19 v3 cities already done)
const CITIES = [
  // Remaining from v3 list (v3 stopped at Pittsburgh)
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
  { name: 'Madison', state: 'WI', box: [43.01,-89.50,43.14,-89.33] },
  { name: 'Des Moines', state: 'IA', box: [41.55,-93.72,41.64,-93.57] },
  { name: 'Wichita', state: 'KS', box: [37.63,-97.44,37.74,-97.29] },
  { name: 'Lincoln', state: 'NE', box: [40.78,-96.76,40.84,-96.64] },
  { name: 'Hartford', state: 'CT', box: [41.72,-72.72,41.79,-72.65] },
  { name: 'Providence', state: 'RI', box: [41.78,-71.49,41.87,-71.38] },
  // New cities not in any previous run
  { name: 'Houston', state: 'TX', box: [29.65,-95.50,29.87,-95.27] },
  { name: 'Dallas', state: 'TX', box: [32.68,-96.90,32.85,-96.72] },
  { name: 'San Antonio', state: 'TX', box: [29.36,-98.57,29.54,-98.38] },
  { name: 'Philadelphia', state: 'PA', box: [39.88,-75.25,40.04,-74.97] },
  { name: 'Chicago', state: 'IL', box: [41.80,-87.72,41.98,-87.58] },
  { name: 'Detroit', state: 'MI', box: [42.28,-83.13,42.43,-82.96] },
  { name: 'Cleveland', state: 'OH', box: [41.43,-81.83,41.57,-81.62] },
  { name: 'St. Louis', state: 'MO', box: [38.55,-90.32,38.72,-90.18] },
  { name: 'San Jose', state: 'CA', box: [37.28,-122.02,37.41,-121.86] },
  { name: 'San Francisco', state: 'CA', box: [37.71,-122.51,37.81,-122.38] },
  { name: 'Oakland', state: 'CA', box: [37.75,-122.27,37.88,-122.14] },
  { name: 'Long Beach', state: 'CA', box: [33.74,-118.23,33.86,-118.10] },
  { name: 'Virginia Beach', state: 'VA', box: [36.74,-76.07,36.93,-75.96] },
  { name: 'Norfolk', state: 'VA', box: [36.83,-76.37,36.94,-76.24] },
  { name: 'Greensboro', state: 'NC', box: [35.98,-80.00,36.13,-79.83] },
  { name: 'Durham', state: 'NC', box: [35.94,-79.01,36.07,-78.84] },
  { name: 'Anchorage', state: 'AK', box: [61.10,-150.20,61.35,-149.70] },
  { name: 'Honolulu', state: 'HI', box: [21.27,-157.91,21.39,-157.80] },
  { name: 'Fargo', state: 'ND', box: [46.84,-96.88,46.94,-96.78] },
  { name: 'Sioux Falls', state: 'SD', box: [43.49,-96.79,43.60,-96.68] },
  { name: 'Burlington', state: 'VT', box: [44.45,-73.27,44.51,-73.17] },
  { name: 'Chattanooga', state: 'TN', box: [35.00,-85.37,35.13,-85.22] },
  { name: 'Knoxville', state: 'TN', box: [35.92,-84.07,36.06,-83.86] },
  { name: 'Little Rock', state: 'AR', box: [34.65,-92.44,34.79,-92.23] },
  { name: 'Jackson', state: 'MS', box: [32.26,-90.25,32.38,-90.10] },
  { name: 'Columbia', state: 'SC', box: [33.97,-81.14,34.06,-80.97] },
  { name: 'Savannah', state: 'GA', box: [31.99,-81.19,32.10,-81.05] },
  { name: 'Shreveport', state: 'LA', box: [32.40,-93.84,32.53,-93.72] },
  { name: 'Lubbock', state: 'TX', box: [33.53,-102.00,33.62,-101.85] },
];

const AMENITIES = ['restaurant','cafe','bar','hotel','spa','beauty','hair_care','fast_food','bakery','pub'];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchFast(url, redirects = 0) {
  return new Promise(resolve => {
    if (redirects > 2) return resolve('');
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Accept': 'text/html,*/*;q=0.9',
          'Connection': 'close'
        },
        timeout: 3000
      }, res => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirects < 2) {
          let next;
          try { next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href; }
          catch { return resolve(''); }
          res.resume();
          return fetchFast(next, redirects + 1).then(resolve);
        }
        let data = '';
        res.on('data', c => { data += c; if (data.length > 100000) { req.destroy(); resolve(data); } });
        res.on('end', () => resolve(data));
      });
      req.on('error', () => resolve(''));
      req.on('timeout', () => { req.destroy(); resolve(''); });
    } catch { resolve(''); }
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
    if (JUNK_PREFIXES.some(p => e.startsWith(p))) return false;
    if (/\.(png|jpg|gif|css|js|svg|woff|ttf|ico)$/i.test(e)) return false;
    if (e.includes('..') || e.length > 80) return false;
    return true;
  });

  const same = filtered.filter(e => e.split('@')[1].includes(domain));
  return same[0] || filtered[0] || null;
}

async function getEmailFast(siteUrl) {
  let origin, domain;
  try {
    const u = new URL(siteUrl.startsWith('http') ? siteUrl : 'https://' + siteUrl);
    origin = u.origin;
    domain = u.hostname.replace(/^www\./, '');
  } catch { return null; }
  if (JUNK_DOMAINS.has(domain)) return null;

  const home = await fetchFast(origin + '/');
  if (home) {
    const e = extractEmail(home, domain);
    if (e) return e;
  }

  const contact = await fetchFast(origin + '/contact');
  if (contact) {
    const e = extractEmail(contact, domain);
    if (e) return e;
  }
  return null;
}

async function mapConcurrent(arr, fn, concurrency = 5) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < arr.length) {
      const i = idx++;
      results[i] = await fn(arr[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, arr.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function queryOverpass(city) {
  const [s, w, n, e] = city.box;
  const nodes = AMENITIES.map(a => `node["amenity"="${a}"]["website"](${s},${w},${n},${e});`).join('\n  ');
  const query = `[out:json][timeout:25];\n(\n  ${nodes}\n);\nout 300;`;
  const postData = 'data=' + encodeURIComponent(query);

  return new Promise(resolve => {
    const req = https.request({
      hostname: 'overpass-api.de',
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'ReplyPilot/1.0'
      },
      timeout: 30000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve([]);
        try { resolve(JSON.parse(d).elements || []); } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.write(postData);
    req.end();
  });
}

function wrapEmail(bodyHtml, unsubEmail) {
  return `
<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;background:#f5f3ef;padding:24px 16px">
  <div style="background:#0F3460;padding:18px 28px;border-radius:8px 8px 0 0">
    <span style="font-family:Georgia,serif;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">
      Reply<span style="color:#E8922A">Pilot</span>
    </span>
  </div>
  <div style="background:#ffffff;padding:32px 28px;border:1px solid #e8e0d6;border-top:none;border-radius:0 0 8px 8px;color:#1a1a1a;line-height:1.7;font-size:15px">
    ${bodyHtml}
  </div>
  <div style="padding:20px 28px;text-align:center">
    <p style="font-size:11px;color:#999;margin:0">
      © 2026 ReplyPilot &nbsp;·&nbsp;
      <a href="https://reply-pilot.net" style="color:#999;text-decoration:none">reply-pilot.net</a>
      &nbsp;·&nbsp;
      <a href="mailto:RPCS@reply-pilot.net?subject=Unsubscribe&body=Please unsubscribe ${encodeURIComponent(unsubEmail || '')}" style="color:#999;text-decoration:none">Unsubscribe</a>
    </p>
  </div>
</div>`;
}

function buildEmailMsg(bizName, cityState) {
  const city = cityState.split(',')[0];
  const greeting = bizName ? `Hi ${bizName} team,` : 'Hi there,';

  const body = `
<p style="margin-top:0">${greeting}</p>

<p>We're reaching out from <strong>ReplyPilot</strong> — an AI-powered platform built to help local businesses manage and respond to online reviews without spending hours doing it manually.</p>

<p>Here's what businesses in ${city} are using it for:</p>

<table style="width:100%;border-collapse:collapse;margin:16px 0">
  <tr>
    <td style="padding:10px 12px;background:#f9f7f4;border-radius:6px;display:block">
      <strong style="color:#0F3460">📊 Sentiment analysis</strong><br>
      <span style="font-size:14px;color:#555">Every review scored and categorized automatically across Google, Yelp & Facebook.</span>
    </td>
  </tr>
  <tr><td style="height:8px"></td></tr>
  <tr>
    <td style="padding:10px 12px;background:#f9f7f4;border-radius:6px;display:block">
      <strong style="color:#0F3460">✍️ AI-generated responses</strong><br>
      <span style="font-size:14px;color:#555">One click generates a professional reply that sounds like your team — not a bot.</span>
    </td>
  </tr>
  <tr><td style="height:8px"></td></tr>
  <tr>
    <td style="padding:10px 12px;background:#f9f7f4;border-radius:6px;display:block">
      <strong style="color:#0F3460">🔔 Instant review alerts</strong><br>
      <span style="font-size:14px;color:#555">Get notified the moment a new review comes in so you never miss one.</span>
    </td>
  </tr>
  <tr><td style="height:8px"></td></tr>
  <tr>
    <td style="padding:10px 12px;background:#f9f7f4;border-radius:6px;display:block">
      <strong style="color:#0F3460">📈 Rating trend tracker</strong><br>
      <span style="font-size:14px;color:#555">See what's working and where to improve over time.</span>
    </td>
  </tr>
</table>

<p>Businesses using ReplyPilot save <strong>2–3 hours per week</strong> and see higher review response rates almost immediately.</p>

<p style="text-align:center;margin:28px 0">
  <a href="https://reply-pilot.net/register.html"
     style="background:#0F3460;color:#ffffff;padding:13px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
    Start Free — No Credit Card Required →
  </a>
</p>

<p style="color:#555;font-size:14px">Questions? Reply to this email and someone from our team will get back to you.</p>

<p style="margin-bottom:0">
  The ReplyPilot Team<br>
  <a href="https://reply-pilot.net" style="color:#0F3460">reply-pilot.net</a>
</p>`;

  return {
    from: 'ReplyPilot Team <noreply@reply-pilot.net>',
    reply_to: 'RPCS@reply-pilot.net',
    subject: `Manage your ${city} reviews with AI — free to start`,
    html: wrapEmail(body, '')
  };
}

async function processCity(city, globalState) {
  if (globalState.sent >= globalState.target) return;
  console.log(`\nCity: ${city.name}, ${city.state}`);

  const elements = await queryOverpass(city);
  console.log(`  OSM: ${elements.length} with websites`);
  await delay(1200);

  const businesses = elements
    .filter(el => el.tags && (el.tags.website || el.tags['contact:website']))
    .map(el => ({ name: el.tags.name || '', website: el.tags.website || el.tags['contact:website'] }));

  await mapConcurrent(businesses, async (biz) => {
    if (globalState.sent >= globalState.target) return;

    const email = await getEmailFast(biz.website);
    if (!email) return;

    if (sentSet.has(email)) return;
    sentSet.add(email);

    try {
      const msg = buildEmailMsg(biz.name, `${city.name}, ${city.state}`);
      msg.to = email;
      await resend.emails.send(msg);
      batchSent.push(email);
      globalState.sent++;
      console.log(`  [${globalState.sent}] ${email} (${biz.name})`);
      fs.appendFileSync(SENT_FILE, email + '\n');
    } catch (e) {
      console.log(`  FAIL: ${e.message?.slice(0,60)}`);
    }
  }, 5);
}

async function main() {
  console.log('OSM v4 — new cities, professional template');
  console.log('Resend key:', RESEND_KEY ? RESEND_KEY.slice(0,12) + '...' : 'MISSING');
  console.log('Already sent:', sentSet.size, '\n');

  const globalState = { sent: 0, target: 500 };

  for (const city of CITIES) {
    if (globalState.sent >= globalState.target) break;
    await processCity(city, globalState);
  }

  if (batchSent.length > 0) {
    fs.writeFileSync(BATCH_OUT, batchSent.join('\n') + '\n');
    console.log(`\nSaved ${batchSent.length} → ${BATCH_OUT}`);
  }
  console.log(`\nFinal count: ${globalState.sent} new emails sent`);
}

main().catch(console.error);
