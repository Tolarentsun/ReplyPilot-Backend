/**
 * OSM v7: Hit the 2k mark — more UK, AU, SA + untouched US metros
 * Target: 1000 emails
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const { Resend } = require('resend');

const BASE = 'C:/Users/chris/AppData/Local/Temp/ReplyPilot-Backend/';
const SENT_FILE = BASE + 'sent-emails.txt';
const BATCH_OUT = BASE + 'sent-batch10-2026-05-05.txt';

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
  'druryhotels.com','starbucks.com','subway.com','mcdonalds.com','dunkindonuts.com',
  'dominos.com','pizzahut.com','panera.com','chipotle.com','olivegarden.com','chilis.com',
  'applebees.com','dennys.com','ihop.com','wixpress.com','wholefoods.com','walmart.com',
  'ingest.us.sentry.io','ingest.sentry.io','meltingpot.com','anthonys.com','mcmenamins.com',
  'greggs.co.uk','premierinn.com','travelodge.co.uk','jdwetherspoon.com','nandos.co.uk',
  'pizzaexpress.com','wagamama.com','mcdonalds.co.uk','dominos.co.uk','pizzahut.co.uk',
  'kfc.com','burgerking.com','subwayaustralia.com.au','kfc.com.au','grilld.com.au'
]);

const JUNK_PREFIXES = ['noreply','no-reply','donotreply','privacy','legal','abuse','postmaster',
  'mailer','press','bounce','unsubscribe','marketing','info@starbucks','wfm.alumni'];

const CITIES = [
  // --- MORE UK ---
  { name: 'Newcastle',     state: 'UK', box: [54.96,-1.63,54.99,-1.59] },
  { name: 'Sheffield',     state: 'UK', box: [53.37,-1.49,53.40,-1.45] },
  { name: 'Nottingham',    state: 'UK', box: [52.94,-1.17,52.97,-1.13] },
  { name: 'Cardiff',       state: 'UK', box: [51.47,-3.19,51.50,-3.15] },
  { name: 'Leicester',     state: 'UK', box: [52.63,-1.14,52.66,-1.10] },
  { name: 'Southampton',   state: 'UK', box: [50.89,-1.42,50.92,-1.38] },
  { name: 'Brighton',      state: 'UK', box: [50.82,-0.15,50.84,-0.12] },
  { name: 'Oxford',        state: 'UK', box: [51.74,-1.27,51.77,-1.23] },
  { name: 'Cambridge',     state: 'UK', box: [52.20,0.11,52.22,0.14] },
  { name: 'Bath',          state: 'UK', box: [51.37,-2.38,51.39,-2.35] },
  { name: 'York',          state: 'UK', box: [53.95,-1.10,53.97,-1.07] },

  // --- MORE AUSTRALIA ---
  { name: 'Canberra',      state: 'AU', box: [-35.29,149.12,-35.27,149.14] },
  { name: 'Hobart',        state: 'AU', box: [-42.89,147.32,-42.87,147.34] },
  { name: 'Geelong',       state: 'AU', box: [-38.15,144.35,-38.13,144.37] },
  { name: 'Newcastle AU',  state: 'AU', box: [-32.93,151.77,-32.91,151.79] },
  { name: 'Sunshine Coast',state: 'AU', box: [-26.65,153.06,-26.63,153.08] },
  { name: 'Wollongong',    state: 'AU', box: [-34.43,150.89,-34.41,150.91] },

  // --- SOUTH AFRICA (large English-speaking population) ---
  { name: 'Cape Town',     state: 'ZA', box: [-33.93,18.41,-33.91,18.43] },
  { name: 'Johannesburg',  state: 'ZA', box: [-26.21,28.04,-26.19,28.06] },

  // --- MORE NZ ---
  { name: 'Hamilton',      state: 'NZ', box: [-37.79,175.27,-37.77,175.29] },
  { name: 'Dunedin',       state: 'NZ', box: [-45.88,170.49,-45.86,170.51] },

  // --- UNTOUCHED US METROS ---
  { name: 'Reno',          state: 'NV', box: [39.52,-119.83,39.55,-119.80] },
  { name: 'Henderson',     state: 'NV', box: [36.03,-115.08,36.06,-115.04] },
  { name: 'Irvine',        state: 'CA', box: [33.67,-117.83,33.70,-117.80] },
  { name: 'Anaheim',       state: 'CA', box: [33.83,-117.93,33.86,-117.90] },
  { name: 'Santa Ana',     state: 'CA', box: [33.74,-117.88,33.77,-117.84] },
  { name: 'Chula Vista',   state: 'CA', box: [32.63,-117.08,32.66,-117.04] },
  { name: 'Modesto',       state: 'CA', box: [37.63,-121.01,37.66,-120.97] },
  { name: 'Fontana',       state: 'CA', box: [34.09,-117.46,34.12,-117.43] },
  { name: 'Moreno Valley', state: 'CA', box: [33.93,-117.24,33.96,-117.21] },
  { name: 'Glendale',      state: 'AZ', box: [33.53,-112.19,33.56,-112.15] },
  { name: 'Gilbert',       state: 'AZ', box: [33.34,-111.79,33.37,-111.76] },
  { name: 'Peoria',        state: 'IL', box: [40.69,-89.60,40.72,-89.57] },
  { name: 'Rockford',      state: 'IL', box: [42.26,-89.10,42.29,-89.07] },
  { name: 'Springfield',   state: 'IL', box: [39.79,-89.66,39.82,-89.63] },
  { name: 'Dayton',        state: 'OH', box: [39.75,-84.21,39.78,-84.18] },
  { name: 'Fort Wayne',    state: 'IN', box: [41.07,-85.15,41.10,-85.11] },
  { name: 'South Bend',    state: 'IN', box: [41.67,-86.26,41.70,-86.23] },
  { name: 'Green Bay',     state: 'WI', box: [44.51,-88.03,44.53,-88.00] },
  { name: 'Cedar Rapids',  state: 'IA', box: [41.97,-91.68,42.00,-91.65] },
  { name: 'Bellevue',      state: 'WA', box: [47.60,-122.20,47.62,-122.17] },
  { name: 'Everett',       state: 'WA', box: [47.97,-122.22,47.99,-122.19] },
  { name: 'Winston-Salem', state: 'NC', box: [36.09,-80.26,36.12,-80.23] },
  { name: 'Fayetteville',  state: 'NC', box: [35.05,-78.90,35.08,-78.87] },
  { name: 'Mobile',        state: 'AL', box: [30.69,-88.06,30.72,-88.03] },
  { name: 'Montgomery',    state: 'AL', box: [32.36,-86.32,32.39,-86.29] },
  { name: 'Macon',         state: 'GA', box: [32.83,-83.64,32.86,-83.61] },
  { name: 'Evansville',    state: 'IN', box: [37.97,-87.57,38.00,-87.54] },
  { name: 'Sioux City',    state: 'IA', box: [42.49,-96.41,42.52,-96.38] },
  { name: 'Syracuse',      state: 'NY', box: [43.04,-76.16,43.07,-76.13] },
  { name: 'Yonkers',       state: 'NY', box: [40.93,-73.90,40.96,-73.87] },
  { name: 'Jersey City',   state: 'NJ', box: [40.71,-74.07,40.74,-74.04] },
  { name: 'Newark',        state: 'NJ', box: [40.73,-74.18,40.76,-74.14] },
];

const AMENITIES = [
  'restaurant','cafe','bar','hotel','spa','beauty','hair_care','fast_food','bakery','pub',
  'dentist','gym','veterinary','car_repair','cinema','theatre','nightclub','fitness_centre',
  'optician','pharmacy','ice_cream','coffee'
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
  if (home) { const e = extractEmail(home, domain); if (e) return e; }
  const contact = await fetchFast(origin + '/contact');
  if (contact) { const e = extractEmail(contact, domain); if (e) return e; }
  return null;
}

async function mapConcurrent(arr, fn, concurrency = 5) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < arr.length) { const i = idx++; results[i] = await fn(arr[i], i); }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, arr.length) }, worker));
  return results;
}

async function queryOverpass(city) {
  const [s, w, n, e] = city.box;
  const nodes = AMENITIES.map(a => `node["amenity"="${a}"]["website"](${s},${w},${n},${e});`).join('\n  ');
  const postData = 'data=' + encodeURIComponent(`[out:json][timeout:30];\n(\n  ${nodes}\n);\nout 300;`);
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'overpass-api.de', path: '/api/interpreter', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData), 'User-Agent': 'ReplyPilot/1.0' },
      timeout: 35000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { if (res.statusCode !== 200) return resolve([]); try { resolve(JSON.parse(d).elements || []); } catch { resolve([]); } });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.write(postData); req.end();
  });
}

function wrapEmail(bodyHtml) {
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
      <a href="mailto:RPCS@reply-pilot.net?subject=Unsubscribe" style="color:#999;text-decoration:none">Unsubscribe</a>
    </p>
  </div>
</div>`;
}

function buildEmailMsg(bizName) {
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
  <p style="margin:0;font-size:14px;color:#444">ReplyPilot analyzes every review to show you what customers love, what's hurting your rating, and how your scores trend over time. You'll know exactly what to fix and what to double down on.</p>
</div>
<div style="background:#f9f7f4;border-radius:8px;padding:18px 20px;margin:20px 0;border-left:4px solid #27ae60">
  <p style="margin:0 0 6px;font-weight:700;color:#0F3460;font-size:14px">🔔 NEVER MISS A REVIEW AGAIN</p>
  <p style="margin:0;font-size:14px;color:#444">Get instant alerts the moment a new review comes in across Google, Yelp & Facebook — so you can respond while it's still fresh.</p>
</div>
<p>Businesses using ReplyPilot save <strong>2–3 hours per week</strong> and respond to more reviews.</p>
<p style="text-align:center;margin:28px 0">
  <a href="https://reply-pilot.net/register.html"
     style="background:#0F3460;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;letter-spacing:0.3px">
    Start Free — No Credit Card Required →
  </a>
</p>
<p style="font-size:13px;color:#777;text-align:center;margin-top:-12px">Takes 2 minutes to set up. Free plan available.</p>
<p style="margin-bottom:0">The ReplyPilot Team<br><a href="https://reply-pilot.net" style="color:#0F3460">reply-pilot.net</a></p>`;
  return {
    from: 'ReplyPilot Team <noreply@reply-pilot.net>',
    reply_to: 'RPCS@reply-pilot.net',
    subject: `Stop spending 20 minutes writing review replies — there's a better way`,
    html: wrapEmail(body)
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
      const msg = buildEmailMsg(biz.name);
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
  console.log('OSM v7 — More UK/AU/ZA + untouched US metros, target 1000');
  console.log('Resend key:', RESEND_KEY ? RESEND_KEY.slice(0,12) + '...' : 'MISSING');
  console.log('Already sent:', sentSet.size, '\n');
  const globalState = { sent: 0, target: 1000 };
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
