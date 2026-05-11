/**
 * OSM v6: International (UK, AU, NZ, IE, SG) + smaller US metros
 * Expanded business types: any business with customer reviews
 * Target: 2000 emails
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const { Resend } = require('resend');

const BASE = 'C:/Users/chris/AppData/Local/Temp/ReplyPilot-Backend/';
const SENT_FILE = BASE + 'sent-emails.txt';
const BATCH_OUT = BASE + 'sent-batch9-2026-05-05.txt';

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
  'mcmenamins.com','cactusrestaurants.com','matadorrestaurants.com','dukesseafood.com',
  // UK/AU chains
  'greggs.co.uk','premierinn.com','travelodge.co.uk','whitbread.com','jdwetherspoon.com',
  'nandos.com','nandos.co.uk','kfc.com','burgerking.com','pizzaexpress.com','wagamama.com',
  'harvester.co.uk','tobyeatout.co.uk','mitchellsbutlers.com','mcdonalds.co.uk',
  'dominos.co.uk','pizzahut.co.uk','papajohns.co.uk','subwayaustralia.com.au',
  'hungryhannahs.com.au','maccas.com.au','kfc.com.au','grilld.com.au'
]);

const JUNK_PREFIXES = ['noreply','no-reply','donotreply','privacy','legal','abuse','postmaster',
  'mailer','press','bounce','unsubscribe','marketing','info@starbucks','wfm.alumni'];

const CITIES = [
  // --- UNITED KINGDOM ---
  { name: 'London',       state: 'UK', box: [51.49,-0.18,51.54,-0.06] },
  { name: 'London West',  state: 'UK', box: [51.49,-0.30,51.54,-0.18] },
  { name: 'Manchester',   state: 'UK', box: [53.46,-2.27,53.50,-2.21] },
  { name: 'Birmingham',   state: 'UK', box: [52.46,-1.93,52.50,-1.88] },
  { name: 'Edinburgh',    state: 'UK', box: [55.94,-3.22,55.97,-3.17] },
  { name: 'Bristol',      state: 'UK', box: [51.44,-2.63,51.47,-2.57] },
  { name: 'Leeds',        state: 'UK', box: [53.79,-1.57,53.82,-1.53] },
  { name: 'Liverpool',    state: 'UK', box: [53.39,-3.00,53.42,-2.96] },
  { name: 'Glasgow',      state: 'UK', box: [55.85,-4.30,55.88,-4.25] },

  // --- AUSTRALIA ---
  { name: 'Sydney',       state: 'AU', box: [-33.90,151.18,-33.86,151.22] },
  { name: 'Sydney CBD',   state: 'AU', box: [-33.87,151.20,-33.86,151.22] },
  { name: 'Melbourne',    state: 'AU', box: [-37.82,144.95,-37.80,144.98] },
  { name: 'Brisbane',     state: 'AU', box: [-27.48,153.01,-27.46,153.04] },
  { name: 'Perth',        state: 'AU', box: [-31.96,115.84,-31.94,115.87] },
  { name: 'Adelaide',     state: 'AU', box: [-34.94,138.59,-34.92,138.62] },
  { name: 'Gold Coast',   state: 'AU', box: [-28.02,153.39,-28.00,153.43] },

  // --- NEW ZEALAND ---
  { name: 'Auckland',     state: 'NZ', box: [-36.87,174.74,-36.84,174.78] },
  { name: 'Wellington',   state: 'NZ', box: [-41.30,174.77,-41.28,174.80] },
  { name: 'Christchurch', state: 'NZ', box: [-43.54,172.62,-43.52,172.65] },

  // --- IRELAND ---
  { name: 'Dublin',       state: 'IE', box: [53.33,-6.28,53.36,-6.24] },
  { name: 'Cork',         state: 'IE', box: [51.89,-8.48,51.91,-8.45] },
  { name: 'Galway',       state: 'IE', box: [53.27,-9.07,53.29,-9.04] },

  // --- SINGAPORE ---
  { name: 'Singapore',    state: 'SG', box: [1.28,103.83,1.31,103.86] },
  { name: 'Singapore Orchard', state: 'SG', box: [1.30,103.82,1.32,103.84] },

  // --- SMALLER US METROS ---
  { name: 'Raleigh',         state: 'NC', box: [35.77,-78.69,35.82,-78.63] },
  { name: 'Richmond',        state: 'VA', box: [37.53,-77.48,37.57,-77.43] },
  { name: 'Louisville',      state: 'KY', box: [38.24,-85.78,38.27,-85.73] },
  { name: 'Memphis',         state: 'TN', box: [35.13,-90.07,35.17,-90.02] },
  { name: 'Omaha',           state: 'NE', box: [41.24,-96.04,41.28,-95.98] },
  { name: 'Tulsa',           state: 'OK', box: [36.13,-95.99,36.17,-95.94] },
  { name: 'Fresno',          state: 'CA', box: [36.73,-119.80,36.77,-119.75] },
  { name: 'Hartford',        state: 'CT', box: [41.75,-72.70,41.78,-72.67] },
  { name: 'New Haven',       state: 'CT', box: [41.30,-72.93,41.33,-72.90] },
  { name: 'Buffalo',         state: 'NY', box: [42.88,-78.88,42.91,-78.84] },
  { name: 'Rochester',       state: 'NY', box: [43.15,-77.63,43.18,-77.59] },
  { name: 'Albany',          state: 'NY', box: [42.65,-73.77,42.68,-73.74] },
  { name: 'Albuquerque',     state: 'NM', box: [35.08,-106.68,35.12,-106.63] },
  { name: 'Tucson',          state: 'AZ', box: [32.21,-110.99,32.24,-110.95] },
  { name: 'Provo',           state: 'UT', box: [40.23,-111.66,40.26,-111.63] },
  { name: 'Bakersfield',     state: 'CA', box: [35.37,-119.03,35.40,-118.98] },
  { name: 'Stockton',        state: 'CA', box: [37.96,-121.32,37.99,-121.28] },
  { name: 'Riverside',       state: 'CA', box: [33.98,-117.40,34.02,-117.36] },
  { name: 'Oxnard',          state: 'CA', box: [34.19,-119.20,34.22,-119.17] },
  { name: 'Worcester',       state: 'MA', box: [42.26,-71.82,42.28,-71.79] },
  { name: 'Springfield',     state: 'MA', box: [42.10,-72.59,42.13,-72.56] },
  { name: 'Bridgeport',      state: 'CT', box: [41.17,-73.21,41.19,-73.18] },
  { name: 'Akron',           state: 'OH', box: [41.07,-81.53,41.10,-81.50] },
  { name: 'Toledo',          state: 'OH', box: [41.65,-83.57,41.68,-83.53] },
  { name: 'Lexington',       state: 'KY', box: [38.03,-84.51,38.06,-84.48] },
  { name: 'Baton Rouge',     state: 'LA', box: [30.44,-91.19,30.47,-91.15] },
  { name: 'Des Moines',      state: 'IA', box: [41.58,-93.64,41.61,-93.60] },
  { name: 'Madison',         state: 'WI', box: [43.07,-89.41,43.10,-89.37] },
  { name: 'Grand Rapids',    state: 'MI', box: [42.96,-85.68,42.99,-85.64] },
  { name: 'Spokane',         state: 'WA', box: [47.65,-117.44,47.68,-117.40] },
  { name: 'Tacoma',          state: 'WA', box: [47.24,-122.46,47.26,-122.43] },
  { name: 'Huntsville',      state: 'AL', box: [34.73,-86.60,34.76,-86.57] },
  { name: 'Birmingham',      state: 'AL', box: [33.50,-86.83,33.53,-86.79] },
  { name: 'Augusta',         state: 'GA', box: [33.46,-82.02,33.49,-81.97] },
  { name: 'Cape Coral',      state: 'FL', box: [26.62,-81.99,26.65,-81.95] },
  { name: 'Fort Lauderdale', state: 'FL', box: [26.12,-80.14,26.14,-80.12] },
  { name: 'Hialeah',         state: 'FL', box: [25.85,-80.30,25.87,-80.27] },
  { name: 'Tallahassee',     state: 'FL', box: [30.43,-84.32,30.46,-84.28] },
  { name: 'Columbia',        state: 'MO', box: [38.94,-92.34,38.97,-92.31] },
  { name: 'Lincoln',         state: 'NE', box: [40.80,-96.71,40.83,-96.67] },
  { name: 'Wichita',         state: 'KS', box: [37.68,-97.35,37.71,-97.31] },
  { name: 'Amarillo',        state: 'TX', box: [35.19,-101.84,35.22,-101.81] },
  { name: 'Irving',          state: 'TX', box: [32.82,-97.00,32.85,-96.96] },
  { name: 'Garland',         state: 'TX', box: [32.91,-96.64,32.94,-96.60] },
];

// Expanded: any business type that gets customer reviews
const AMENITIES = [
  'restaurant','cafe','bar','hotel','spa','beauty','hair_care','fast_food','bakery','pub',
  'dentist','gym','veterinary','car_repair','cinema','theatre','nightclub','fitness_centre',
  'optician','pharmacy','laundry','ice_cream','coffee'
];

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
  const query = `[out:json][timeout:30];\n(\n  ${nodes}\n);\nout 300;`;
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
      timeout: 35000
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
  const greeting = bizName ? `Hi ${bizName} team,` : 'Hi there,';

  const body = `
<p style="margin-top:0">${greeting}</p>

<p>How long does it take your team to write a response to a Google review? Even a good one — thanking a customer, addressing a complaint professionally, making it sound genuine — takes <strong>10 to 30 minutes</strong> if you're doing it right.</p>

<p>Most businesses don't do it at all. That's where <strong>ReplyPilot</strong> comes in.</p>

<div style="background:#f9f7f4;border-radius:8px;padding:18px 20px;margin:20px 0;border-left:4px solid #E8922A">
  <p style="margin:0 0 6px;font-weight:700;color:#0F3460;font-size:14px">✍️ AI-GENERATED RESPONSES — IN SECONDS</p>
  <p style="margin:0;font-size:14px;color:#444">ReplyPilot reads each review and generates a professional, on-brand reply instantly. It sounds like your team wrote it — not a bot. You review it, approve it, done. What used to take 20 minutes now takes 20 seconds.</p>
</div>

<div style="background:#f9f7f4;border-radius:8px;padding:18px 20px;margin:20px 0;border-left:4px solid #0F3460">
  <p style="margin:0 0 6px;font-weight:700;color:#0F3460;font-size:14px">📊 REAL INSIGHTS INTO YOUR BUSINESS</p>
  <p style="margin:0;font-size:14px;color:#444">ReplyPilot doesn't just respond — it analyzes every review to show you what customers love, what's hurting your rating, and how your scores trend over time. You'll know exactly what to fix and what to double down on.</p>
</div>

<div style="background:#f9f7f4;border-radius:8px;padding:18px 20px;margin:20px 0;border-left:4px solid #27ae60">
  <p style="margin:0 0 6px;font-weight:700;color:#0F3460;font-size:14px">🔔 NEVER MISS A REVIEW AGAIN</p>
  <p style="margin:0;font-size:14px;color:#444">Get instant alerts the moment a new review comes in across Google, Yelp & Facebook — so you can respond while it's still fresh and show customers you're paying attention.</p>
</div>

<p>Businesses using ReplyPilot save <strong>2–3 hours per week</strong>, respond to more reviews, and get better insight into what's actually driving their ratings.</p>

<p style="text-align:center;margin:28px 0">
  <a href="https://reply-pilot.net/register.html"
     style="background:#0F3460;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;letter-spacing:0.3px">
    Start Free — No Credit Card Required →
  </a>
</p>

<p style="font-size:13px;color:#777;text-align:center;margin-top:-12px">Takes 2 minutes to set up. Free plan available.</p>

<p style="margin-bottom:0">
  The ReplyPilot Team<br>
  <a href="https://reply-pilot.net" style="color:#0F3460">reply-pilot.net</a>
</p>`;

  return {
    from: 'ReplyPilot Team <noreply@reply-pilot.net>',
    reply_to: 'RPCS@reply-pilot.net',
    subject: `Stop spending 20 minutes writing review replies — there's a better way`,
    html: wrapEmail(body, '')
  };
}

async function processCity(city, globalState) {
  if (globalState.sent >= globalState.target) return;
  console.log(`\nCity: ${city.name}, ${city.state}`);

  const elements = await queryOverpass(city);
  console.log(`  OSM: ${elements.length} with websites`);
  await delay(1500);

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
  console.log('OSM v6 — International + smaller US metros, expanded business types');
  console.log('Resend key:', RESEND_KEY ? RESEND_KEY.slice(0,12) + '...' : 'MISSING');
  console.log('Already sent:', sentSet.size, '\n');

  const globalState = { sent: 0, target: 2000 };

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
