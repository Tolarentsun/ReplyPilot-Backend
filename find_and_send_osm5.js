/**
 * OSM v5: 2000 target, AI response focus, business insights copy
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const { Resend } = require('resend');

const BASE = 'C:/Users/chris/AppData/Local/Temp/ReplyPilot-Backend/';
const SENT_FILE = BASE + 'sent-emails.txt';
const BATCH_OUT = BASE + 'sent-batch8-2026-05-05.txt';

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

// Cities not covered in v1–v4
const CITIES = [
  // US cities not yet reached
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
  { name: 'Chattanooga', state: 'TN', box: [35.00,-85.37,35.13,-85.22] },
  { name: 'Knoxville', state: 'TN', box: [35.92,-84.07,36.06,-83.86] },
  { name: 'Little Rock', state: 'AR', box: [34.65,-92.44,34.79,-92.23] },
  { name: 'Columbia', state: 'SC', box: [33.97,-81.14,34.06,-80.97] },
  { name: 'Savannah', state: 'GA', box: [31.99,-81.19,32.10,-81.05] },
  { name: 'Shreveport', state: 'LA', box: [32.40,-93.84,32.53,-93.72] },
  { name: 'Lubbock', state: 'TX', box: [33.53,-102.00,33.62,-101.85] },
  { name: 'Anchorage', state: 'AK', box: [61.10,-150.20,61.35,-149.70] },
  { name: 'Honolulu', state: 'HI', box: [21.27,-157.91,21.39,-157.80] },
  { name: 'Fargo', state: 'ND', box: [46.84,-96.88,46.94,-96.78] },
  { name: 'Sioux Falls', state: 'SD', box: [43.49,-96.79,43.60,-96.68] },
  { name: 'Burlington', state: 'VT', box: [44.45,-73.27,44.51,-73.17] },
  { name: 'Jackson', state: 'MS', box: [32.26,-90.25,32.38,-90.10] },
  { name: 'Spokane', state: 'WA', box: [47.57,-117.54,47.72,-117.32] },
  { name: 'Boise', state: 'ID', box: [43.55,-116.30,43.70,-116.14] },
  { name: 'El Paso', state: 'TX', box: [31.73,-106.55,31.87,-106.38] },
  { name: 'Corpus Christi', state: 'TX', box: [27.70,-97.46,27.83,-97.32] },
  { name: 'Plano', state: 'TX', box: [33.00,-96.80,33.10,-96.65] },
  { name: 'Laredo', state: 'TX', box: [27.48,-99.57,27.57,-99.46] },
  { name: 'Scottsdale', state: 'AZ', box: [33.46,-111.96,33.69,-111.85] },
  { name: 'Mesa', state: 'AZ', box: [33.38,-111.90,33.46,-111.72] },
  { name: 'Tempe', state: 'AZ', box: [33.37,-111.97,33.43,-111.90] },
  { name: 'Chandler', state: 'AZ', box: [33.26,-111.91,33.36,-111.81] },
  { name: 'Colorado Springs', state: 'CO', box: [38.79,-104.88,38.92,-104.73] },
  { name: 'Aurora', state: 'CO', box: [39.62,-104.89,39.72,-104.76] },
  { name: 'Boulder', state: 'CO', box: [39.99,-105.30,40.06,-105.22] },
  { name: 'Fort Collins', state: 'CO', box: [40.54,-105.12,40.62,-105.05] },
  { name: 'Eugene', state: 'OR', box: [44.03,-123.16,44.08,-123.07] },
  { name: 'Salem', state: 'OR', box: [44.90,-123.08,44.97,-122.99] },
  { name: 'Tacoma', state: 'WA', box: [47.20,-122.51,47.28,-122.40] },
  { name: 'Bellevue', state: 'WA', box: [47.57,-122.21,47.62,-122.13] },
  { name: 'Olympia', state: 'WA', box: [47.02,-122.94,47.07,-122.88] },
  { name: 'Bakersfield', state: 'CA', box: [35.32,-119.08,35.43,-118.97] },
  { name: 'Stockton', state: 'CA', box: [37.94,-121.37,38.02,-121.25] },
  { name: 'Riverside', state: 'CA', box: [33.94,-117.46,34.01,-117.36] },
  { name: 'Santa Ana', state: 'CA', box: [33.73,-117.94,33.76,-117.86] },
  { name: 'Anaheim', state: 'CA', box: [33.80,-117.95,33.86,-117.89] },
  { name: 'Irvine', state: 'CA', box: [33.64,-117.84,33.72,-117.74] },
  { name: 'Santa Barbara', state: 'CA', box: [34.40,-119.76,34.44,-119.68] },
  { name: 'Santa Cruz', state: 'CA', box: [36.96,-122.06,37.00,-122.01] },
  { name: 'Monterey', state: 'CA', box: [36.58,-121.93,36.61,-121.88] },
  { name: 'Palm Springs', state: 'CA', box: [33.81,-116.57,33.85,-116.52] },
  { name: 'Las Cruces', state: 'NM', box: [32.29,-106.83,32.34,-106.74] },
  { name: 'Santa Fe', state: 'NM', box: [35.65,-105.99,35.70,-105.93] },
  { name: 'Flagstaff', state: 'AZ', box: [35.17,-111.69,35.21,-111.61] },
  { name: 'Provo', state: 'UT', box: [40.22,-111.68,40.26,-111.63] },
  { name: 'Ogden', state: 'UT', box: [41.21,-111.99,41.25,-111.95] },
  { name: 'Reno', state: 'NV', box: [39.49,-119.86,39.55,-119.78] },
  { name: 'Henderson', state: 'NV', box: [35.96,-115.07,36.02,-115.01] },
  { name: 'Newark', state: 'NJ', box: [40.70,-74.20,40.76,-74.14] },
  { name: 'Jersey City', state: 'NJ', box: [40.70,-74.08,40.73,-74.03] },
  { name: 'Trenton', state: 'NJ', box: [40.21,-74.79,40.24,-74.74] },
  { name: 'Buffalo', state: 'NY', box: [42.87,-78.91,42.92,-78.84] },
  { name: 'Rochester', state: 'NY', box: [43.13,-77.67,43.18,-77.59] },
  { name: 'Albany', state: 'NY', box: [42.64,-73.80,42.69,-73.74] },
  { name: 'Syracuse', state: 'NY', box: [43.03,-76.19,43.07,-76.12] },
  { name: 'Worcester', state: 'MA', box: [42.24,-71.84,42.28,-71.78] },
  { name: 'Springfield', state: 'MA', box: [42.09,-72.62,42.13,-72.56] },
  { name: 'New Haven', state: 'CT', box: [41.28,-72.97,41.32,-72.91] },
  { name: 'Bridgeport', state: 'CT', box: [41.17,-73.22,41.19,-73.17] },
  { name: 'Stamford', state: 'CT', box: [41.04,-73.58,41.08,-73.52] },
  { name: 'Wilmington', state: 'DE', box: [39.73,-75.58,39.76,-75.53] },
  { name: 'Annapolis', state: 'MD', box: [38.97,-76.51,38.99,-76.48] },
  { name: 'Frederick', state: 'MD', box: [39.40,-77.43,39.43,-77.40] },
  { name: 'Alexandria', state: 'VA', box: [38.80,-77.10,38.83,-77.04] },
  { name: 'Arlington', state: 'VA', box: [38.87,-77.13,38.90,-77.08] },
  { name: 'Roanoke', state: 'VA', box: [37.25,-79.97,37.29,-79.92] },
  { name: 'Charleston', state: 'WV', box: [38.33,-81.66,38.37,-81.61] },
  { name: 'Huntington', state: 'WV', box: [38.40,-82.46,38.43,-82.41] },
  { name: 'Lexington', state: 'KY', box: [37.97,-84.55,38.07,-84.44] },
  { name: 'Bowling Green', state: 'KY', box: [36.97,-86.47,37.00,-86.43] },
  { name: 'Evansville', state: 'IN', box: [37.97,-87.60,38.01,-87.54] },
  { name: 'Fort Wayne', state: 'IN', box: [41.07,-85.17,41.11,-85.10] },
  { name: 'South Bend', state: 'IN', box: [41.66,-86.28,41.69,-86.23] },
  { name: 'Lansing', state: 'MI', box: [42.72,-84.59,42.75,-84.54] },
  { name: 'Grand Rapids', state: 'MI', box: [42.93,-85.70,42.97,-85.64] },
  { name: 'Ann Arbor', state: 'MI', box: [42.27,-83.77,42.30,-83.72] },
  { name: 'Flint', state: 'MI', box: [42.99,-83.73,43.03,-83.68] },
  { name: 'Green Bay', state: 'WI', box: [44.49,-88.03,44.53,-87.97] },
  { name: 'Appleton', state: 'WI', box: [44.26,-88.42,44.29,-88.38] },
  { name: 'Duluth', state: 'MN', box: [46.77,-92.14,46.81,-92.08] },
  { name: 'Rochester', state: 'MN', box: [43.99,-92.51,44.03,-92.45] },
  { name: 'Sioux City', state: 'IA', box: [42.48,-96.44,42.51,-96.39] },
  { name: 'Cedar Rapids', state: 'IA', box: [41.96,-91.72,41.99,-91.65] },
  { name: 'Davenport', state: 'IA', box: [41.51,-90.61,41.55,-90.54] },
  { name: 'Springfield', state: 'IL', box: [39.79,-89.68,39.82,-89.63] },
  { name: 'Peoria', state: 'IL', box: [40.68,-89.62,40.71,-89.58] },
  { name: 'Rockford', state: 'IL', box: [42.26,-89.12,42.30,-89.07] },
  // Canadian cities
  { name: 'Toronto', state: 'ON', box: [43.63,-79.45,43.72,-79.33] },
  { name: 'Vancouver', state: 'BC', box: [49.24,-123.16,49.29,-123.07] },
  { name: 'Montreal', state: 'QC', box: [45.49,-73.62,45.55,-73.54] },
  { name: 'Calgary', state: 'AB', box: [51.02,-114.15,51.08,-114.04] },
  { name: 'Edmonton', state: 'AB', box: [53.52,-113.57,53.57,-113.47] },
  { name: 'Ottawa', state: 'ON', box: [45.40,-75.74,45.45,-75.67] },
  { name: 'Winnipeg', state: 'MB', box: [49.85,-97.19,49.90,-97.10] },
  { name: 'Quebec City', state: 'QC', box: [46.80,-71.25,46.83,-71.20] },
  { name: 'Hamilton', state: 'ON', box: [43.24,-79.90,43.27,-79.84] },
  { name: 'Victoria', state: 'BC', box: [48.42,-123.39,48.45,-123.34] },
  { name: 'Kelowna', state: 'BC', box: [49.87,-119.50,49.90,-119.45] },
  { name: 'Saskatoon', state: 'SK', box: [52.12,-106.68,52.16,-106.62] },
  { name: 'Regina', state: 'SK', box: [50.44,-104.64,50.47,-104.59] },
  { name: 'Halifax', state: 'NS', box: [44.63,-63.61,44.67,-63.56] },
  { name: 'St. John\'s', state: 'NL', box: [47.55,-52.74,47.59,-52.69] },
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
  console.log('OSM v5 — 2000 target, AI response focus');
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
