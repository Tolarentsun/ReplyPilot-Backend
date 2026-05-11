/**
 * OSM v9: All review-worthy business types — restaurants + shops + services
 * Broadest targeting yet across fresh city list
 * Target: 1000
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const { Resend } = require('resend');

const BASE = 'C:/Users/chris/AppData/Local/Temp/ReplyPilot-Backend/';
const SENT_FILE = BASE + 'sent-emails.txt';
const BATCH_OUT = BASE + 'sent-batch14-2026-05-10.txt';

const sentSet = new Set(fs.readFileSync(SENT_FILE, 'utf8').toLowerCase().split('\n').map(e => e.trim()).filter(Boolean));
const batchSent = [];

const RESEND_KEY = process.env.RESEND_API_KEY;
const resend = new Resend(RESEND_KEY);

const JUNK_DOMAINS = new Set([
  'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','aol.com','me.com','live.com',
  'squarespace.com','wix.com','godaddy.com','wordpress.com','twitter.com','facebook.com',
  'instagram.com','yelp.com','tripadvisor.com','google.com','apple.com','microsoft.com',
  'sentry.io','example.com','test.com','domain.com','mail.com','yourname.com',
  'caesars.com','hilton.com','marriott.com','hyatt.com','ihg.com','wyndham.com',
  'bestwestern.com','choicehotels.com','extendedstayamerica.com','druryhotels.com',
  'starbucks.com','subway.com','mcdonalds.com','dunkindonuts.com','dominos.com',
  'pizzahut.com','panera.com','chipotle.com','olivegarden.com','chilis.com',
  'applebees.com','dennys.com','ihop.com','wixpress.com','yourdomain.com',
  'angi.com','thumbtack.com','homeadvisor.com','zocdoc.com','healthgrades.com',
  'vitals.com','webmd.com','mindbodyonline.com','vagaro.com','booksy.com',
  'styleseat.com','glofox.com','meltingpot.com','circalasvegas.com'
]);

const JUNK_PREFIXES = ['noreply','no-reply','donotreply','privacy','legal','abuse',
  'postmaster','mailer','press','bounce','unsubscribe','marketing','webmaster'];

const JUNK_EXTS = new Set(['png','jpg','jpeg','gif','svg','webp','ico','pdf','zip','css','js','woff','ttf','mp4','mov']);

// Fresh cities not exhausted by v1-v8
const CITIES = [
  // Mid-size US cities with dense business districts
  { name: 'Nashville', state: 'TN', box: [36.10,-86.85,36.20,-86.75] },
  { name: 'Austin', state: 'TX', box: [30.24,-97.77,30.30,-97.70] },
  { name: 'Denver', state: 'CO', box: [39.71,-104.99,39.76,-104.93] },
  { name: 'Portland', state: 'OR', box: [45.50,-122.70,45.55,-122.63] },
  { name: 'Charlotte', state: 'NC', box: [35.20,-80.87,35.26,-80.80] },
  { name: 'Raleigh', state: 'NC', box: [35.77,-78.67,35.82,-78.60] },
  { name: 'Indianapolis', state: 'IN', box: [39.76,-86.17,39.80,-86.12] },
  { name: 'Columbus', state: 'OH', box: [39.96,-83.02,40.01,-82.96] },
  { name: 'Louisville', state: 'KY', box: [38.23,-85.77,38.28,-85.70] },
  { name: 'Memphis', state: 'TN', box: [35.13,-90.06,35.18,-89.99] },
  { name: 'Baltimore', state: 'MD', box: [39.28,-76.64,39.31,-76.60] },
  { name: 'Milwaukee', state: 'WI', box: [43.03,-87.95,43.07,-87.90] },
  { name: 'Oklahoma City', state: 'OK', box: [35.45,-97.53,35.51,-97.48] },
  { name: 'Pittsburgh', state: 'PA', box: [40.43,-80.02,40.46,-79.97] },
  { name: 'Cincinnati', state: 'OH', box: [39.10,-84.53,39.14,-84.49] },
  { name: 'Kansas City', state: 'MO', box: [39.08,-94.60,39.12,-94.55] },
  { name: 'Cleveland', state: 'OH', box: [41.48,-81.70,41.52,-81.66] },
  { name: 'Omaha', state: 'NE', box: [41.25,-96.02,41.30,-95.96] },
  { name: 'Tulsa', state: 'OK', box: [36.13,-95.98,36.17,-95.93] },
  { name: 'Arlington', state: 'TX', box: [32.71,-97.13,32.75,-97.07] },
  { name: 'Wichita', state: 'KS', box: [37.67,-97.38,37.71,-97.32] },
  { name: 'Bakersfield', state: 'CA', box: [35.36,-119.04,35.41,-118.99] },
  { name: 'Aurora', state: 'CO', box: [39.69,-104.83,39.73,-104.78] },
  { name: 'New Orleans', state: 'LA', box: [29.94,-90.08,29.98,-90.04] },
  { name: 'Tampa', state: 'FL', box: [27.94,-82.50,27.98,-82.45] },
  { name: 'Orlando', state: 'FL', box: [28.52,-81.41,28.57,-81.36] },
  { name: 'St. Louis', state: 'MO', box: [38.62,-90.26,38.67,-90.20] },
  { name: 'Sacramento', state: 'CA', box: [38.55,-121.52,38.59,-121.47] },
  { name: 'Minneapolis', state: 'MN', box: [44.97,-93.29,45.01,-93.24] },
  { name: 'Richmond', state: 'VA', box: [37.52,-77.47,37.56,-77.43] },
  { name: 'Baton Rouge', state: 'LA', box: [30.44,-91.14,30.47,-91.10] },
  { name: 'Lexington', state: 'KY', box: [38.03,-84.52,38.06,-84.48] },
  { name: 'Des Moines', state: 'IA', box: [41.58,-93.64,41.62,-93.59] },
  { name: 'Birmingham', state: 'AL', box: [33.50,-86.82,33.53,-86.78] },
  { name: 'Madison', state: 'WI', box: [43.07,-89.41,43.10,-89.36] },
  { name: 'Rochester', state: 'NY', box: [43.14,-77.64,43.17,-77.59] },
  { name: 'Spokane', state: 'WA', box: [47.65,-117.44,47.68,-117.40] },
  { name: 'Boise', state: 'ID', box: [43.61,-116.21,43.64,-116.17] },
  { name: 'Tacoma', state: 'WA', box: [47.24,-122.46,47.27,-122.42] },
  { name: 'Akron', state: 'OH', box: [41.07,-81.53,41.10,-81.49] },
  { name: 'Knoxville', state: 'TN', box: [35.96,-83.94,35.99,-83.90] },
  { name: 'Little Rock', state: 'AR', box: [34.74,-92.31,34.77,-92.27] },
  { name: 'Providence', state: 'RI', box: [41.82,-71.44,41.85,-71.40] },
  { name: 'Chattanooga', state: 'TN', box: [35.04,-85.32,35.07,-85.28] },
  { name: 'Fayetteville', state: 'NC', box: [35.05,-78.91,35.08,-78.87] },
  { name: 'Jackson', state: 'MS', box: [32.30,-90.20,32.33,-90.16] },
  { name: 'Huntsville', state: 'AL', box: [34.72,-86.60,34.75,-86.55] },
  { name: 'Worcester', state: 'MA', box: [42.26,-71.81,42.29,-71.77] },
  { name: 'Greenville', state: 'SC', box: [34.84,-82.41,34.87,-82.37] },
  { name: 'Columbia', state: 'SC', box: [34.00,-81.05,34.03,-81.01] },
  { name: 'Savannah', state: 'GA', box: [32.07,-81.11,32.10,-81.07] },
  { name: 'Fort Collins', state: 'CO', box: [40.57,-105.09,40.60,-105.05] },
  { name: 'Eugene', state: 'OR', box: [44.04,-123.10,44.07,-123.06] },
  { name: 'Springfield', state: 'MO', box: [37.20,-93.31,37.24,-93.26] },
  { name: 'Peoria', state: 'IL', box: [40.69,-89.60,40.72,-89.56] },
  { name: 'Cape Coral', state: 'FL', box: [26.57,-81.98,26.62,-81.93] },
  { name: 'Fort Wayne', state: 'IN', box: [41.08,-85.15,41.11,-85.10] },
  { name: 'Grand Rapids', state: 'MI', box: [42.96,-85.68,42.99,-85.63] },
  { name: 'Shreveport', state: 'LA', box: [32.48,-93.78,32.51,-93.73] },
  { name: 'Montgomery', state: 'AL', box: [32.36,-86.31,32.39,-86.27] },
  { name: 'Augusta', state: 'GA', box: [33.47,-81.98,33.50,-81.94] },
  { name: 'Tallahassee', state: 'FL', box: [30.43,-84.30,30.46,-84.26] },
  { name: 'Glendale', state: 'CA', box: [34.14,-118.27,34.17,-118.23] },
  { name: 'Irvine', state: 'CA', box: [33.67,-117.82,33.70,-117.78] },
  { name: 'Scottsdale', state: 'AZ', box: [33.49,-111.94,33.52,-111.90] },
  { name: 'Henderson', state: 'NV', box: [36.02,-115.10,36.05,-115.06] },
  { name: 'Chandler', state: 'AZ', box: [33.30,-111.88,33.33,-111.83] },
  { name: 'Tempe', state: 'AZ', box: [33.41,-111.95,33.44,-111.91] },
  { name: 'Plano', state: 'TX', box: [33.02,-96.75,33.05,-96.70] },
  { name: 'Garland', state: 'TX', box: [32.90,-96.68,32.93,-96.63] },
  { name: 'Lubbock', state: 'TX', box: [33.57,-101.92,33.60,-101.87] },
  { name: 'Corpus Christi', state: 'TX', box: [27.78,-97.42,27.81,-97.37] },
  { name: 'Durham', state: 'NC', box: [35.99,-78.93,36.02,-78.89] },
  { name: 'Greensboro', state: 'NC', box: [36.07,-79.82,36.10,-79.78] },
  { name: 'Winston-Salem', state: 'NC', box: [36.09,-80.26,36.12,-80.21] },
  { name: 'Anchorage', state: 'AK', box: [61.18,-149.92,61.22,-149.87] },
  { name: 'Honolulu', state: 'HI', box: [21.30,-157.86,21.33,-157.82] },
  // Canadian
  { name: 'Toronto', state: 'ON', box: [43.64,-79.40,43.67,-79.36] },
  { name: 'Vancouver', state: 'BC', box: [49.27,-123.13,49.30,-123.09] },
  { name: 'Calgary', state: 'AB', box: [51.04,-114.07,51.07,-114.03] },
  { name: 'Montreal', state: 'QC', box: [45.51,-73.59,45.54,-73.55] },
  { name: 'Edmonton', state: 'AB', box: [53.54,-113.52,53.57,-113.48] },
  { name: 'Ottawa', state: 'ON', box: [45.41,-75.72,45.44,-75.68] },
  { name: 'Winnipeg', state: 'MB', box: [49.88,-97.15,49.91,-97.11] },
  { name: 'Halifax', state: 'NS', box: [44.64,-63.59,44.67,-63.55] },
  { name: 'Victoria', state: 'BC', box: [48.43,-123.37,48.46,-123.33] },
  { name: 'Saskatoon', state: 'SK', box: [52.13,-106.66,52.16,-106.62] },
];

// ALL review-worthy business types combined
const AMENITY_TAGS = ['restaurant','cafe','bar','pub','fast_food','bakery','ice_cream',
  'hotel','spa','beauty','hair_care','dentist','doctors','veterinary',
  'physiotherapist','optometrist','car_wash','cinema','theatre','nightclub'];
const SHOP_TAGS = ['hairdresser','beauty','massage','optician','car_repair','tattoo',
  'cosmetics','pet_grooming','laundry','dry_cleaning','florist','jewelry',
  'clothes','shoes','bookstore','gift','antiques','wine','chocolate','coffee',
  'bakery','deli','butcher','seafood','organic','tea'];
const LEISURE_TAGS = ['fitness_centre','sports_centre','yoga','dance','swimming_pool',
  'golf_course','bowling_alley','escape_game'];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchFast(url, redirects = 0) {
  return new Promise(resolve => {
    if (redirects > 2) return resolve('');
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Accept': 'text/html,*/*;q=0.9', 'Connection': 'close' },
        timeout: 3000
      }, res => {
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
    const ext = dom.split('.').pop();
    if (JUNK_EXTS.has(ext)) return false;
    if (/\.(png|jpg|gif|svg|webp|ico|pdf|css|js)\b/i.test(e)) return false;
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
  const lines = [
    ...AMENITY_TAGS.map(a => `node["amenity"="${a}"]["website"](${s},${w},${n},${e});`),
    ...SHOP_TAGS.map(a => `node["shop"="${a}"]["website"](${s},${w},${n},${e});`),
    ...LEISURE_TAGS.map(a => `node["leisure"="${a}"]["website"](${s},${w},${n},${e});`),
  ].join('\n  ');
  const query = `[out:json][timeout:40];\n(\n  ${lines}\n);\nout 300;`;
  const postData = 'data=' + encodeURIComponent(query);
  return new Promise(resolve => {
    const req = https.request({ hostname: 'overpass-api.de', path: '/api/interpreter', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData), 'User-Agent': 'ReplyPilot/1.0' }, timeout: 45000 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { if (res.statusCode !== 200) return resolve([]); try { resolve(JSON.parse(d).elements || []); } catch { resolve([]); } });
    });
    req.on('error', () => resolve([])); req.on('timeout', () => { req.destroy(); resolve([]); });
    req.write(postData); req.end();
  });
}

function wrapEmail(body) {
  return `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;background:#f5f3ef;padding:24px 16px"><div style="background:#0F3460;padding:18px 28px;border-radius:8px 8px 0 0"><span style="font-family:Georgia,serif;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">Reply<span style="color:#E8922A">Pilot</span></span></div><div style="background:#ffffff;padding:32px 28px;border:1px solid #e8e0d6;border-top:none;border-radius:0 0 8px 8px;color:#1a1a1a;line-height:1.7;font-size:15px">${body}</div><div style="padding:20px 28px;text-align:center"><p style="font-size:11px;color:#999;margin:0">2026 ReplyPilot &nbsp; <a href="https://reply-pilot.net" style="color:#999;text-decoration:none">reply-pilot.net</a> &nbsp; <a href="mailto:RPCS@reply-pilot.net?subject=Unsubscribe" style="color:#999;text-decoration:none">Unsubscribe</a></p></div></div>`;
}

const BIZ_LABELS = {
  restaurant:'restaurant', cafe:'cafe', bar:'bar', pub:'pub', fast_food:'restaurant',
  bakery:'bakery', ice_cream:'shop', hotel:'hotel', spa:'spa', beauty:'salon',
  hair_care:'salon', dentist:'dental practice', doctors:'medical practice',
  veterinary:'veterinary practice', physiotherapist:'clinic', optometrist:'eye care practice',
  car_wash:'car wash', cinema:'cinema', theatre:'theatre', nightclub:'venue',
  hairdresser:'salon', massage:'massage studio', optician:'eye care practice',
  car_repair:'auto shop', tattoo:'tattoo studio', cosmetics:'beauty shop',
  pet_grooming:'pet grooming business', laundry:'laundromat', dry_cleaning:'dry cleaner',
  florist:'flower shop', jewelry:'jewelry store', clothes:'clothing boutique',
  shoes:'shoe store', bookstore:'bookstore', gift:'gift shop', antiques:'antique shop',
  wine:'wine shop', chocolate:'chocolate shop', coffee:'coffee shop', deli:'deli',
  butcher:'butcher shop', seafood:'seafood shop', organic:'organic store', tea:'tea shop',
  fitness_centre:'gym', sports_centre:'sports facility', yoga:'yoga studio',
  dance:'dance studio', swimming_pool:'pool and fitness club', golf_course:'golf club',
  bowling_alley:'bowling alley', escape_game:'escape room'
};

function buildEmailMsg(bizName, bizType) {
  const label = BIZ_LABELS[bizType] || 'business';
  const greeting = bizName ? `Hi ${bizName} team,` : 'Hi there,';
  const isRestaurant = ['restaurant','cafe','bar','pub','fast_food','bakery'].includes(bizType);

  const painPoint = isRestaurant
    ? `How long does it take your team to write a response to a Google review? Even a good one takes <strong>10 to 30 minutes</strong> if you are doing it right. Most restaurants do not respond at all -- and that silence costs you new customers every day.`
    : `Your ${label}'s reputation lives and dies by Google reviews. But most ${label}s never respond to them -- and that silence costs you new customers every single day.`;

  const body = `<p style="margin-top:0">${greeting}</p>
<p>${painPoint}</p>
<p>That is exactly what <strong>ReplyPilot</strong> solves.</p>
<div style="background:#f9f7f4;border-radius:8px;padding:18px 20px;margin:20px 0;border-left:4px solid #E8922A">
  <p style="margin:0 0 6px;font-weight:700;color:#0F3460;font-size:14px">AI WRITES YOUR REVIEW RESPONSES -- IN SECONDS</p>
  <p style="margin:0;font-size:14px;color:#444">Paste in a review, click generate, and ReplyPilot writes a professional on-brand reply instantly. Sounds like your team -- not a bot. Review, approve, done. 20 seconds instead of 20 minutes.</p>
</div>
<div style="background:#f9f7f4;border-radius:8px;padding:18px 20px;margin:20px 0;border-left:4px solid #0F3460">
  <p style="margin:0 0 6px;font-weight:700;color:#0F3460;font-size:14px">SEE WHAT IS ACTUALLY HURTING YOUR RATING</p>
  <p style="margin:0;font-size:14px;color:#444">ReplyPilot analyzes every review to surface what customers love, what they complain about, and how your score trends -- so you know exactly what to fix.</p>
</div>
<div style="background:#f9f7f4;border-radius:8px;padding:18px 20px;margin:20px 0;border-left:4px solid #27ae60">
  <p style="margin:0 0 6px;font-weight:700;color:#0F3460;font-size:14px">NEVER MISS A REVIEW AGAIN</p>
  <p style="margin:0;font-size:14px;color:#444">Get alerted the moment a new review comes in -- respond while it is fresh and show customers you are paying attention.</p>
</div>
<p>Free plan available. No credit card required. Takes 2 minutes to set up.</p>
<p style="text-align:center;margin:28px 0"><a href="https://reply-pilot.net/register.html" style="background:#0F3460;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Start Free -- No Credit Card Required</a></p>
<p style="margin-bottom:0">The ReplyPilot Team<br><a href="https://reply-pilot.net" style="color:#0F3460">reply-pilot.net</a></p>`;

  return {
    from: 'ReplyPilot Team <noreply@reply-pilot.net>',
    reply_to: 'RPCS@reply-pilot.net',
    subject: isRestaurant
      ? `Stop spending 20 minutes writing review replies -- there is a better way`
      : `Your ${label} is losing customers from unanswered reviews`,
    html: wrapEmail(body)
  };
}

async function processCity(city, globalState) {
  if (globalState.sent >= globalState.target) return;
  console.log(`\nCity: ${city.name}, ${city.state}`);
  const elements = await queryOverpass(city);
  console.log(`  OSM: ${elements.length} with websites`);
  await delay(1000);

  const businesses = elements
    .filter(el => el.tags && (el.tags.website || el.tags['contact:website']))
    .map(el => ({
      name: el.tags.name || '',
      website: el.tags.website || el.tags['contact:website'],
      type: el.tags.amenity || el.tags.shop || el.tags.leisure || 'business'
    }));

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
    } catch(e) { console.log(`  FAIL: ${e.message?.slice(0,60)}`); }
  }, 5);
}

async function main() {
  console.log('OSM v9 -- all review-worthy business types');
  console.log('Resend key:', RESEND_KEY ? RESEND_KEY.slice(0,12) + '...' : 'MISSING');
  console.log('Already sent:', sentSet.size, '\n');
  const globalState = { sent: 0, target: 1000 };
  for (const city of CITIES) {
    if (globalState.sent >= globalState.target) break;
    await processCity(city, globalState);
  }
  try { fs.writeFileSync(BATCH_OUT, batchSent.join('\n') + '\n'); } catch(e) { console.log('Batch save error:', e.message); }
  console.log(`\nSaved ${batchSent.length} -> ${BATCH_OUT}`);
  console.log(`\nFinal count: ${globalState.sent} new emails sent`);
}

main().catch(console.error);
