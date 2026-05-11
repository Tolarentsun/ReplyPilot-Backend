/**
 * OSM v11: Wider bounding boxes (13km radius) + out 1000 — target 2000
 * Previous scripts used ~4km boxes capped at 300 nodes, leaving suburbs untouched.
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const { Resend } = require('resend');

const BASE = 'C:/Users/chris/AppData/Local/Temp/ReplyPilot-Backend/';
const SENT_FILE = BASE + 'sent-emails.txt';
const BATCH_OUT = BASE + 'sent-batch16-2026-05-11.txt';

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

// Wider boxes (~13km radius) to capture suburbs, not just downtown cores
// Dedup handles any overlap with previous batches — only fresh emails go out
const CITIES = [
  // Major metros — large boxes, dense OSM data, mostly fresh suburbs
  { name: 'Chicago', state: 'IL', box: [41.82,-87.72,41.95,-87.55] },
  { name: 'Los Angeles', state: 'CA', box: [34.00,-118.35,34.13,-118.20] },
  { name: 'Houston', state: 'TX', box: [29.70,-95.43,29.82,-95.28] },
  { name: 'Phoenix', state: 'AZ', box: [33.38,-112.13,33.52,-111.97] },
  { name: 'Philadelphia', state: 'PA', box: [39.90,-75.22,40.02,-75.08] },
  { name: 'San Antonio', state: 'TX', box: [29.38,-98.58,29.52,-98.43] },
  { name: 'San Diego', state: 'CA', box: [32.66,-117.22,32.79,-117.07] },
  { name: 'Dallas', state: 'TX', box: [32.73,-96.86,32.85,-96.71] },
  { name: 'San Jose', state: 'CA', box: [37.28,-122.00,37.40,-121.86] },
  { name: 'Detroit', state: 'MI', box: [42.28,-83.12,42.41,-82.96] },
  { name: 'Las Vegas', state: 'NV', box: [36.08,-115.23,36.22,-115.07] },
  { name: 'Washington DC', state: 'DC', box: [38.84,-77.09,38.96,-76.95] },
  { name: 'Atlanta', state: 'GA', box: [33.69,-84.47,33.82,-84.32] },
  { name: 'Miami', state: 'FL', box: [25.73,-80.27,25.86,-80.12] },
  { name: 'Seattle', state: 'WA', box: [47.54,-122.40,47.67,-122.25] },
  { name: 'Boston', state: 'MA', box: [42.30,-71.13,42.42,-70.99] },
  { name: 'Fort Worth', state: 'TX', box: [32.69,-97.42,32.82,-97.27] },
  { name: 'San Francisco', state: 'CA', box: [37.74,-122.48,37.86,-122.36] },
  { name: 'New York', state: 'NY', box: [40.68,-74.02,40.82,-73.88] },
  // Re-run v9 cities that hit 300-node cap — expanded boxes capture suburbs
  { name: 'Nashville', state: 'TN', box: [36.09,-86.88,36.22,-86.72] },
  { name: 'Austin', state: 'TX', box: [30.21,-97.82,30.34,-97.66] },
  { name: 'Denver', state: 'CO', box: [39.67,-105.04,39.80,-104.88] },
  { name: 'Portland', state: 'OR', box: [45.46,-122.74,45.59,-122.60] },
  { name: 'Charlotte', state: 'NC', box: [35.16,-80.95,35.30,-80.79] },
  { name: 'Minneapolis', state: 'MN', box: [44.92,-93.36,45.05,-93.20] },
  { name: 'New Orleans', state: 'LA', box: [29.88,-90.15,30.01,-89.99] },
  { name: 'Tampa', state: 'FL', box: [27.88,-82.57,28.01,-82.41] },
  { name: 'Orlando', state: 'FL', box: [28.46,-81.48,28.59,-81.32] },
  { name: 'St. Louis', state: 'MO', box: [38.56,-90.33,38.69,-90.17] },
  { name: 'Pittsburgh', state: 'PA', box: [40.38,-80.09,40.51,-79.93] },
  { name: 'Cincinnati', state: 'OH', box: [39.06,-84.60,39.19,-84.44] },
  { name: 'Kansas City', state: 'MO', box: [39.02,-94.67,39.15,-94.51] },
  { name: 'Indianapolis', state: 'IN', box: [39.71,-86.24,39.84,-86.08] },
  { name: 'Columbus', state: 'OH', box: [39.91,-83.09,40.04,-82.93] },
  // Re-run v10 cities that hit 300-node cap — expanded boxes
  { name: 'Salt Lake City', state: 'UT', box: [40.70,-111.99,40.83,-111.83] },
  { name: 'Boulder', state: 'CO', box: [39.96,-105.36,40.09,-105.20] },
  { name: 'Charlottesville', state: 'VA', box: [37.98,-78.57,38.11,-78.41] },
  { name: 'State College', state: 'PA', box: [40.74,-77.94,40.87,-77.78] },
  { name: 'Portland', state: 'ME', box: [43.60,-70.35,43.73,-70.19] },
  { name: 'Burlington', state: 'VT', box: [44.42,-73.29,44.55,-73.13] },
  { name: 'Athens', state: 'GA', box: [33.90,-83.46,34.03,-83.30] },
  { name: 'Ann Arbor', state: 'MI', box: [42.22,-83.83,42.35,-83.67] },
  { name: 'Champaign', state: 'IL', box: [40.06,-88.32,40.19,-88.16] },
  { name: 'Bend', state: 'OR', box: [43.99,-121.39,44.12,-121.23] },
  { name: 'Santa Barbara', state: 'CA', box: [34.36,-119.77,34.49,-119.61] },
  { name: 'Pasadena', state: 'CA', box: [34.09,-118.22,34.22,-118.06] },
  // Canadian metros — expanded boxes
  { name: 'Toronto', state: 'ON', box: [43.59,-79.52,43.72,-79.36] },
  { name: 'Vancouver', state: 'BC', box: [49.21,-123.20,49.34,-123.04] },
  { name: 'Montreal', state: 'QC', box: [45.45,-73.66,45.58,-73.50] },
  { name: 'Calgary', state: 'AB', box: [50.98,-114.14,51.11,-113.98] },
  { name: 'Edmonton', state: 'AB', box: [53.48,-113.59,53.61,-113.43] },
  { name: 'Ottawa', state: 'ON', box: [45.35,-75.79,45.48,-75.63] },
  { name: 'Kitchener', state: 'ON', box: [43.38,-80.57,43.51,-80.41] },
  { name: 'Hamilton', state: 'ON', box: [43.19,-79.95,43.32,-79.79] },
  { name: 'Kelowna', state: 'BC', box: [49.83,-119.57,49.96,-119.41] },
  // Fresh cities not in v9 or v10
  { name: 'Colorado Springs', state: 'CO', box: [38.78,-104.91,38.91,-104.75] },
  { name: 'Albuquerque', state: 'NM', box: [35.03,-106.75,35.16,-106.59] },
  { name: 'Tucson', state: 'AZ', box: [32.16,-111.06,32.29,-110.90] },
  { name: 'Reno', state: 'NV', box: [39.47,-119.90,39.60,-119.74] },
  { name: 'Boise', state: 'ID', box: [43.57,-116.28,43.70,-116.12] },
  { name: 'Spokane', state: 'WA', box: [47.60,-117.51,47.73,-117.35] },
  { name: 'Tacoma', state: 'WA', box: [47.19,-122.53,47.32,-122.37] },
  { name: 'Buffalo', state: 'NY', box: [42.82,-78.95,42.95,-78.79] },
  { name: 'Albany', state: 'NY', box: [42.60,-73.84,42.73,-73.68] },
  { name: 'Hartford', state: 'CT', box: [41.71,-72.77,41.84,-72.61] },
  { name: 'Providence', state: 'RI', box: [41.77,-71.51,41.90,-71.35] },
  { name: 'Richmond', state: 'VA', box: [37.47,-77.54,37.60,-77.38] },
  { name: 'Norfolk', state: 'VA', box: [36.80,-76.37,36.93,-76.21] },
  { name: 'Savannah', state: 'GA', box: [32.02,-81.18,32.15,-81.02] },
  { name: 'Charleston', state: 'SC', box: [32.72,-80.02,32.85,-79.86] },
  { name: 'Jacksonville', state: 'FL', box: [30.27,-81.74,30.40,-81.58] },
  { name: 'Fort Lauderdale', state: 'FL', box: [26.07,-80.21,26.20,-80.05] },
  { name: 'Sarasota', state: 'FL', box: [27.28,-82.61,27.41,-82.45] },
  { name: 'Gainesville', state: 'FL', box: [29.60,-82.41,29.73,-82.25] },
  { name: 'Birmingham', state: 'AL', box: [33.45,-86.89,33.58,-86.73] },
  { name: 'Louisville', state: 'KY', box: [38.18,-85.84,38.31,-85.68] },
  { name: 'Memphis', state: 'TN', box: [35.08,-90.13,35.21,-89.97] },
  { name: 'Knoxville', state: 'TN', box: [35.91,-84.01,36.04,-83.85] },
  { name: 'Chattanooga', state: 'TN', box: [34.99,-85.39,35.12,-85.23] },
  { name: 'Lexington', state: 'KY', box: [37.98,-84.59,38.11,-84.43] },
  { name: 'Omaha', state: 'NE', box: [41.20,-96.09,41.33,-95.93] },
  { name: 'Des Moines', state: 'IA', box: [41.53,-93.71,41.66,-93.55] },
  { name: 'Madison', state: 'WI', box: [43.02,-89.48,43.15,-89.32] },
  { name: 'Milwaukee', state: 'WI', box: [42.97,-88.02,43.10,-87.86] },
  { name: 'Grand Rapids', state: 'MI', box: [42.91,-85.75,43.04,-85.59] },
  { name: 'Toledo', state: 'OH', box: [41.61,-83.64,41.74,-83.48] },
  { name: 'Dayton', state: 'OH', box: [39.70,-84.28,39.83,-84.12] },
  { name: 'Akron', state: 'OH', box: [41.02,-81.60,41.15,-81.44] },
];

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
  const query = `[out:json][timeout:50];\n(\n  ${lines}\n);\nout 1000;`;
  const postData = 'data=' + encodeURIComponent(query);
  return new Promise(resolve => {
    const req = https.request({ hostname: 'overpass-api.de', path: '/api/interpreter', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData), 'User-Agent': 'ReplyPilot/1.0' }, timeout: 55000 }, res => {
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
  console.log('OSM v11 -- wider boxes + out 1000, target 2000');
  console.log('Resend key:', RESEND_KEY ? RESEND_KEY.slice(0,12) + '...' : 'MISSING');
  console.log('Already sent:', sentSet.size, '\n');
  const globalState = { sent: 0, target: 2000 };
  for (const city of CITIES) {
    if (globalState.sent >= globalState.target) break;
    await processCity(city, globalState);
  }
  try { fs.writeFileSync(BATCH_OUT, batchSent.join('\n') + '\n'); } catch(e) { console.log('Batch save error:', e.message); }
  console.log(`\nSaved ${batchSent.length} -> ${BATCH_OUT}`);
  console.log(`\nFinal count: ${globalState.sent} new emails sent`);
}

main().catch(console.error);
