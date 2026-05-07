/**
 * OSM v8: Multi-namespace queries — amenity + shop + leisure tags
 * Previous scripts only queried amenity=* missing hairdressers (shop=), gyms (leisure=), etc.
 * Target: 500
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const { Resend } = require('resend');

const BASE = 'C:/Users/chris/AppData/Local/Temp/ReplyPilot-Backend/';
const SENT_FILE = BASE + 'sent-emails.txt';
const BATCH_OUT = BASE + 'sent-batch11-2026-05-07.txt';

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
  'applebees.com','dennys.com','ihop.com','wixpress.com','yourdomain.com','angi.com',
  'thumbtack.com','homeadvisor.com','zocdoc.com','healthgrades.com','vitals.com','webmd.com',
  'mindbodyonline.com','vagaro.com','booksy.com','styleseat.com','glofox.com'
]);

const JUNK_PREFIXES = ['noreply','no-reply','donotreply','privacy','legal','abuse','postmaster','mailer','press','bounce','unsubscribe','marketing'];

const CITIES = [
  { name: 'New York', state: 'NY', box: [40.68,-74.05,40.80,-73.92] },
  { name: 'Los Angeles', state: 'CA', box: [33.93,-118.45,34.10,-118.20] },
  { name: 'Chicago', state: 'IL', box: [41.82,-87.78,41.99,-87.60] },
  { name: 'Houston', state: 'TX', box: [29.68,-95.55,29.87,-95.30] },
  { name: 'Phoenix', state: 'AZ', box: [33.37,-112.20,33.61,-111.95] },
  { name: 'Philadelphia', state: 'PA', box: [39.88,-75.24,40.04,-74.98] },
  { name: 'San Antonio', state: 'TX', box: [29.36,-98.60,29.55,-98.38] },
  { name: 'San Diego', state: 'CA', box: [32.65,-117.26,32.84,-117.05] },
  { name: 'Dallas', state: 'TX', box: [32.68,-96.92,32.86,-96.68] },
  { name: 'Austin', state: 'TX', box: [30.17,-97.84,30.40,-97.64] },
  { name: 'Jacksonville', state: 'FL', box: [30.18,-81.81,30.41,-81.56] },
  { name: 'Fort Worth', state: 'TX', box: [32.65,-97.47,32.84,-97.24] },
  { name: 'Columbus', state: 'OH', box: [39.90,-83.10,40.07,-82.86] },
  { name: 'Charlotte', state: 'NC', box: [35.10,-80.94,35.30,-80.74] },
  { name: 'Indianapolis', state: 'IN', box: [39.66,-86.30,39.86,-86.06] },
  { name: 'San Francisco', state: 'CA', box: [37.70,-122.52,37.82,-122.36] },
  { name: 'Seattle', state: 'WA', box: [47.49,-122.43,47.66,-122.25] },
  { name: 'Denver', state: 'CO', box: [39.63,-105.10,39.80,-104.87] },
  { name: 'Nashville', state: 'TN', box: [36.05,-86.93,36.24,-86.68] },
  { name: 'Washington DC', state: 'DC', box: [38.82,-77.12,38.99,-76.91] },
  { name: 'Las Vegas', state: 'NV', box: [36.05,-115.28,36.29,-115.05] },
  { name: 'Atlanta', state: 'GA', box: [33.65,-84.55,33.88,-84.30] },
  { name: 'Miami', state: 'FL', box: [25.70,-80.35,25.87,-80.18] },
  { name: 'Orlando', state: 'FL', box: [28.45,-81.51,28.62,-81.32] },
  { name: 'Minneapolis', state: 'MN', box: [44.90,-93.37,45.05,-93.17] },
  { name: 'Portland', state: 'OR', box: [45.46,-122.72,45.58,-122.56] },
  { name: 'Raleigh', state: 'NC', box: [35.72,-78.77,35.88,-78.58] },
  { name: 'Salt Lake City', state: 'UT', box: [40.73,-111.96,40.80,-111.86] },
  { name: 'Richmond', state: 'VA', box: [37.46,-77.52,37.58,-77.40] },
  { name: 'Memphis', state: 'TN', box: [35.05,-90.12,35.22,-89.88] },
  { name: 'Louisville', state: 'KY', box: [38.13,-85.88,38.31,-85.63] },
  { name: 'Baltimore', state: 'MD', box: [39.24,-76.72,39.38,-76.54] },
  { name: 'Milwaukee', state: 'WI', box: [43.00,-87.99,43.14,-87.84] },
  { name: 'Pittsburgh', state: 'PA', box: [40.39,-80.09,40.50,-79.92] },
  { name: 'Cincinnati', state: 'OH', box: [39.07,-84.65,39.19,-84.44] },
  { name: 'Oklahoma City', state: 'OK', box: [35.38,-97.63,35.57,-97.38] },
  { name: 'New Orleans', state: 'LA', box: [29.90,-90.14,30.04,-89.95] },
  { name: 'Sacramento', state: 'CA', box: [38.50,-121.56,38.63,-121.41] },
  { name: 'Kansas City', state: 'MO', box: [39.02,-94.69,39.15,-94.53] },
  { name: 'Tucson', state: 'AZ', box: [32.16,-111.07,32.30,-110.87] },
  { name: 'Albuquerque', state: 'NM', box: [35.03,-106.78,35.20,-106.56] },
  { name: 'Tampa', state: 'FL', box: [27.88,-82.58,28.04,-82.38] },
  { name: 'Omaha', state: 'NE', box: [41.20,-96.15,41.35,-95.94] },
  { name: 'Fort Lauderdale', state: 'FL', box: [26.07,-80.23,26.19,-80.10] },
  { name: 'Scottsdale', state: 'AZ', box: [33.45,-111.98,33.70,-111.84] },
  { name: 'Birmingham', state: 'AL', box: [33.44,-86.93,33.58,-86.72] },
  { name: 'Baton Rouge', state: 'LA', box: [30.39,-91.20,30.53,-91.05] },
  { name: 'Madison', state: 'WI', box: [43.02,-89.52,43.13,-89.33] },
  { name: 'Des Moines', state: 'IA', box: [41.53,-93.73,41.64,-93.57] },
  { name: 'Akron', state: 'OH', box: [41.03,-81.57,41.12,-81.48] },
  { name: 'Boise', state: 'ID', box: [43.54,-116.32,43.69,-116.14] },
  { name: 'Toronto', state: 'ON', box: [43.60,-79.52,43.74,-79.30] },
  { name: 'Vancouver', state: 'BC', box: [49.22,-123.20,49.30,-123.05] },
  { name: 'Calgary', state: 'AB', box: [51.00,-114.20,51.12,-114.00] },
  { name: 'Montreal', state: 'QC', box: [45.48,-73.68,45.57,-73.52] },
  { name: 'Edmonton', state: 'AB', box: [53.49,-113.62,53.60,-113.44] },
  { name: 'Ottawa', state: 'ON', box: [45.38,-75.78,45.47,-75.65] },
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchFast(url, redirects = 0) {
  return new Promise(resolve => {
    if (redirects > 2) return resolve('');
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Accept': 'text/html,*/*;q=0.9', 'Connection': 'close' }, timeout: 3000 }, res => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirects < 2) {
          let next; try { next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href; } catch { return resolve(''); }
          res.resume(); return fetchFast(next, redirects + 1).then(resolve);
        }
        let data = '';
        res.on('data', c => { data += c; if (data.length > 100000) { req.destroy(); resolve(data); } });
        res.on('end', () => resolve(data));
      });
      req.on('error', () => resolve('')); req.on('timeout', () => { req.destroy(); resolve(''); });
    } catch { resolve(''); }
  });
}

function extractEmail(html, domain) {
  const rx = /\b([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,6})\b/gi;
  const emails = new Set(); let m;
  while ((m = rx.exec(html)) !== null) emails.add(m[1].toLowerCase());
  return [...emails].filter(e => {
    const [local, dom] = e.split('@'); if (!dom) return false;
    if (JUNK_DOMAINS.has(dom)) return false;
    if (JUNK_PREFIXES.some(p => local.startsWith(p))) return false;
    return true;
  })[0] || null;
}

async function getEmailFast(website) {
  let origin; try { origin = new URL(website).origin; } catch { return null; }
  const domain = origin.replace(/^https?:\/\/(www\.)?/, '');
  if (JUNK_DOMAINS.has(domain)) return null;
  const [home, contact] = await Promise.all([fetchFast(origin), fetchFast(origin + '/contact')]);
  return (home && extractEmail(home, domain)) || (contact && extractEmail(contact, domain)) || null;
}

async function mapConcurrent(arr, fn, concurrency = 5) {
  let idx = 0;
  async function worker() { while (idx < arr.length) { const i = idx++; await fn(arr[i], i); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, arr.length) }, worker));
}

async function queryOverpass(city) {
  const [s, w, n, e] = city.box;
  const amenityTags = ['dentist','doctors','veterinary','physiotherapist','beauty','spa','car_wash'];
  const shopTags = ['hairdresser','beauty','massage','optician','car_repair','tattoo','cosmetics','pet_grooming','laundry','dry_cleaning'];
  const leisureTags = ['fitness_centre','sports_centre','yoga','dance','swimming_pool','golf_course'];

  const lines = [
    ...amenityTags.map(a => `node["amenity"="${a}"]["website"](${s},${w},${n},${e});`),
    ...shopTags.map(a => `node["shop"="${a}"]["website"](${s},${w},${n},${e});`),
    ...leisureTags.map(a => `node["leisure"="${a}"]["website"](${s},${w},${n},${e});`),
  ].join('\n  ');

  const query = `[out:json][timeout:35];\n(\n  ${lines}\n);\nout 300;`;
  const postData = 'data=' + encodeURIComponent(query);

  return new Promise(resolve => {
    const req = https.request({ hostname: 'overpass-api.de', path: '/api/interpreter', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData), 'User-Agent': 'ReplyPilot/1.0' }, timeout: 40000 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { if (res.statusCode !== 200) return resolve([]); try { resolve(JSON.parse(d).elements || []); } catch { resolve([]); } });
    });
    req.on('error', () => resolve([])); req.on('timeout', () => { req.destroy(); resolve([]); });
    req.write(postData); req.end();
  });
}

function wrapEmail(bodyHtml) {
  return `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;background:#f5f3ef;padding:24px 16px"><div style="background:#0F3460;padding:18px 28px;border-radius:8px 8px 0 0"><span style="font-family:Georgia,serif;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">Reply<span style="color:#E8922A">Pilot</span></span></div><div style="background:#ffffff;padding:32px 28px;border:1px solid #e8e0d6;border-top:none;border-radius:0 0 8px 8px;color:#1a1a1a;line-height:1.7;font-size:15px">${bodyHtml}</div><div style="padding:20px 28px;text-align:center"><p style="font-size:11px;color:#999;margin:0">2026 ReplyPilot &nbsp; <a href="https://reply-pilot.net" style="color:#999;text-decoration:none">reply-pilot.net</a> &nbsp; <a href="mailto:RPCS@reply-pilot.net?subject=Unsubscribe" style="color:#999;text-decoration:none">Unsubscribe</a></p></div></div>`;
}

const BIZ_LABELS = { dentist:'dental practice', doctors:'medical practice', veterinary:'veterinary practice', physiotherapist:'clinic', fitness_centre:'gym', sports_centre:'sports facility', hairdresser:'salon', beauty:'salon', spa:'spa', massage:'massage studio', car_repair:'auto shop', optician:'eye care practice', yoga:'yoga studio', dance:'dance studio', pet_grooming:'pet grooming business', laundry:'laundromat', dry_cleaning:'dry cleaning business', tattoo:'tattoo studio', swimming_pool:'pool and fitness club', golf_course:'golf club', car_wash:'car wash' };

function buildEmailMsg(bizName, bizType) {
  const label = BIZ_LABELS[bizType] || 'business';
  const greeting = bizName ? `Hi ${bizName} team,` : 'Hi there,';
  const body = `<p style="margin-top:0">${greeting}</p>
<p>Your ${label}'s reputation lives and dies by Google reviews. But most ${label}s never respond to them -- and that silence costs you new customers every day.</p>
<p>Responding to every review (good and bad) signals to Google that you are active and engaged. It builds trust with potential customers. And it takes <strong>10-30 minutes per review</strong> to do right -- time most owners do not have.</p>
<p>That is exactly what <strong>ReplyPilot</strong> solves.</p>
<div style="background:#f9f7f4;border-radius:8px;padding:18px 20px;margin:20px 0;border-left:4px solid #E8922A"><p style="margin:0 0 6px;font-weight:700;color:#0F3460;font-size:14px">AI WRITES YOUR REVIEW RESPONSES -- IN SECONDS</p><p style="margin:0;font-size:14px;color:#444">Paste in a review, click generate, and ReplyPilot writes a professional on-brand reply instantly. Sounds like your team -- not a bot. Review, approve, done. 20 seconds instead of 20 minutes.</p></div>
<div style="background:#f9f7f4;border-radius:8px;padding:18px 20px;margin:20px 0;border-left:4px solid #0F3460"><p style="margin:0 0 6px;font-weight:700;color:#0F3460;font-size:14px">SEE EXACTLY WHAT IS HURTING YOUR RATING</p><p style="margin:0;font-size:14px;color:#444">ReplyPilot analyzes every review to surface what customers love, what they complain about, and how your score trends over time.</p></div>
<p>Free plan available. No credit card required. Takes 2 minutes to set up.</p>
<p style="text-align:center;margin:28px 0"><a href="https://reply-pilot.net/register.html" style="background:#0F3460;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Start Free -- No Credit Card Required</a></p>
<p style="margin-bottom:0">The ReplyPilot Team<br><a href="https://reply-pilot.net" style="color:#0F3460">reply-pilot.net</a></p>`;
  return { from: 'ReplyPilot Team <noreply@reply-pilot.net>', reply_to: 'RPCS@reply-pilot.net', subject: `Your ${label} is losing customers from unanswered reviews`, html: wrapEmail(body) };
}

async function processCity(city, globalState) {
  if (globalState.sent >= globalState.target) return;
  console.log(`\nCity: ${city.name}, ${city.state}`);
  const elements = await queryOverpass(city);
  console.log(`  OSM: ${elements.length} with websites`);
  await delay(1200);

  const businesses = elements
    .filter(el => el.tags && (el.tags.website || el.tags['contact:website']))
    .map(el => ({ name: el.tags.name || '', website: el.tags.website || el.tags['contact:website'], type: el.tags.amenity || el.tags.shop || el.tags.leisure || 'business' }));

  await mapConcurrent(businesses, async (biz) => {
    if (globalState.sent >= globalState.target) return;
    const email = await getEmailFast(biz.website);
    if (!email || sentSet.has(email)) return;
    sentSet.add(email);
    try {
      const msg = buildEmailMsg(biz.name, biz.type);
      msg.to = email;
      await resend.emails.send(msg);
      batchSent.push(email);
      globalState.sent++;
      console.log(`  [${globalState.sent}] ${email} (${biz.name} -- ${biz.type})`);
      fs.appendFileSync(SENT_FILE, email + '\n');
    } catch (e) { console.log(`  FAIL: ${e.message?.slice(0,60)}`); }
  }, 5);
}

async function main() {
  console.log('OSM v8 -- multi-namespace: amenity + shop + leisure tags');
  console.log('Resend key:', RESEND_KEY ? RESEND_KEY.slice(0,12) + '...' : 'MISSING');
  console.log('Already sent:', sentSet.size, '\n');
  const globalState = { sent: 0, target: 500 };
  for (const city of CITIES) {
    if (globalState.sent >= globalState.target) break;
    await processCity(city, globalState);
  }
  fs.writeFileSync(BATCH_OUT, batchSent.join('\n') + '\n');
  console.log(`\nSaved ${batchSent.length} -> ${BATCH_OUT}`);
  console.log(`\nFinal count: ${globalState.sent} new emails sent`);
}

main().catch(console.error);
