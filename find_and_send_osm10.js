/**
 * OSM v10: All review-worthy business types — fresh city list, target 2000
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const { Resend } = require('resend');

const BASE = 'C:/Users/chris/AppData/Local/Temp/ReplyPilot-Backend/';
const SENT_FILE = BASE + 'sent-emails.txt';
const BATCH_OUT = BASE + 'sent-batch15-2026-05-10.txt';

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

// Fresh cities — none used in v9 or earlier batches
const CITIES = [
  // Mountain West
  { name: 'Salt Lake City', state: 'UT', box: [40.75,-111.92,40.79,-111.87] },
  { name: 'Provo', state: 'UT', box: [40.23,-111.67,40.26,-111.63] },
  { name: 'Ogden', state: 'UT', box: [41.22,-111.99,41.25,-111.95] },
  { name: 'St. George', state: 'UT', box: [37.09,-113.59,37.12,-113.55] },
  { name: 'Reno', state: 'NV', box: [39.52,-119.83,39.55,-119.79] },
  { name: 'Colorado Springs', state: 'CO', box: [38.83,-104.84,38.87,-104.80] },
  { name: 'Boulder', state: 'CO', box: [40.01,-105.29,40.04,-105.25] },
  { name: 'Pueblo', state: 'CO', box: [38.26,-104.62,38.29,-104.58] },
  { name: 'Albuquerque', state: 'NM', box: [35.08,-106.68,35.12,-106.63] },
  { name: 'Santa Fe', state: 'NM', box: [35.68,-105.95,35.71,-105.91] },
  { name: 'Las Cruces', state: 'NM', box: [32.31,-106.78,32.34,-106.74] },
  { name: 'Flagstaff', state: 'AZ', box: [35.19,-111.67,35.22,-111.63] },
  { name: 'Tucson', state: 'AZ', box: [32.22,-110.99,32.25,-110.94] },
  { name: 'Mesa', state: 'AZ', box: [33.41,-111.84,33.44,-111.79] },
  // Pacific
  { name: 'Oakland', state: 'CA', box: [37.80,-122.28,37.83,-122.24] },
  { name: 'Berkeley', state: 'CA', box: [37.86,-122.28,37.89,-122.24] },
  { name: 'Long Beach', state: 'CA', box: [33.77,-118.20,33.80,-118.16] },
  { name: 'Pasadena', state: 'CA', box: [34.14,-118.15,34.17,-118.11] },
  { name: 'Santa Barbara', state: 'CA', box: [34.41,-119.70,34.44,-119.66] },
  { name: 'Santa Rosa', state: 'CA', box: [38.44,-122.74,38.47,-122.70] },
  { name: 'Fresno', state: 'CA', box: [36.73,-119.80,36.77,-119.76] },
  { name: 'Stockton', state: 'CA', box: [37.95,-121.31,37.98,-121.27] },
  { name: 'Riverside', state: 'CA', box: [33.98,-117.40,34.01,-117.36] },
  { name: 'Anaheim', state: 'CA', box: [33.83,-117.93,33.86,-117.89] },
  { name: 'Santa Cruz', state: 'CA', box: [36.97,-122.04,37.00,-122.00] },
  { name: 'San Luis Obispo', state: 'CA', box: [35.27,-120.68,35.30,-120.64] },
  { name: 'Bend', state: 'OR', box: [44.05,-121.32,44.08,-121.28] },
  { name: 'Salem', state: 'OR', box: [44.93,-123.06,44.96,-123.02] },
  { name: 'Corvallis', state: 'OR', box: [44.56,-123.28,44.59,-123.24] },
  { name: 'Medford', state: 'OR', box: [42.32,-122.88,42.35,-122.84] },
  { name: 'Bellingham', state: 'WA', box: [48.74,-122.49,48.77,-122.45] },
  { name: 'Olympia', state: 'WA', box: [47.04,-122.92,47.07,-122.88] },
  { name: 'Yakima', state: 'WA', box: [46.60,-120.52,46.63,-120.48] },
  { name: 'Kennewick', state: 'WA', box: [46.20,-119.17,46.23,-119.13] },
  // Texas fresh
  { name: 'El Paso', state: 'TX', box: [31.75,-106.50,31.79,-106.46] },
  { name: 'Amarillo', state: 'TX', box: [35.20,-101.85,35.23,-101.81] },
  { name: 'Waco', state: 'TX', box: [31.54,-97.14,31.57,-97.10] },
  { name: 'McAllen', state: 'TX', box: [26.20,-98.25,26.23,-98.21] },
  { name: 'Midland', state: 'TX', box: [31.99,-102.09,32.02,-102.05] },
  { name: 'Abilene', state: 'TX', box: [32.44,-99.75,32.47,-99.71] },
  { name: 'Tyler', state: 'TX', box: [32.34,-95.32,32.37,-95.28] },
  { name: 'Beaumont', state: 'TX', box: [30.08,-94.13,30.11,-94.09] },
  // Southeast fresh
  { name: 'Charleston', state: 'SC', box: [32.77,-79.95,32.80,-79.91] },
  { name: 'Macon', state: 'GA', box: [32.83,-83.65,32.86,-83.61] },
  { name: 'Athens', state: 'GA', box: [33.95,-83.39,33.98,-83.35] },
  { name: 'Columbus', state: 'GA', box: [32.46,-84.99,32.49,-84.95] },
  { name: 'Jacksonville', state: 'FL', box: [30.32,-81.67,30.35,-81.63] },
  { name: 'Fort Lauderdale', state: 'FL', box: [26.12,-80.14,26.15,-80.10] },
  { name: 'St. Petersburg', state: 'FL', box: [27.77,-82.64,27.80,-82.60] },
  { name: 'Gainesville', state: 'FL', box: [29.65,-82.34,29.68,-82.30] },
  { name: 'Sarasota', state: 'FL', box: [27.33,-82.54,27.36,-82.50] },
  { name: 'West Palm Beach', state: 'FL', box: [26.71,-80.07,26.74,-80.03] },
  { name: 'Pensacola', state: 'FL', box: [30.41,-87.24,30.44,-87.20] },
  { name: 'Daytona Beach', state: 'FL', box: [29.21,-81.03,29.24,-80.99] },
  { name: 'Clearwater', state: 'FL', box: [27.96,-82.81,27.99,-82.77] },
  { name: 'Lakeland', state: 'FL', box: [28.04,-81.97,28.07,-81.93] },
  { name: 'Mobile', state: 'AL', box: [30.69,-88.07,30.72,-88.03] },
  { name: 'Tuscaloosa', state: 'AL', box: [33.20,-87.56,33.23,-87.52] },
  { name: 'Biloxi', state: 'MS', box: [30.39,-89.01,30.42,-88.97] },
  { name: 'Gulfport', state: 'MS', box: [30.36,-89.10,30.39,-89.06] },
  { name: 'Hattiesburg', state: 'MS', box: [31.32,-89.32,31.35,-89.28] },
  { name: 'Norfolk', state: 'VA', box: [36.85,-76.30,36.88,-76.26] },
  { name: 'Virginia Beach', state: 'VA', box: [36.85,-75.98,36.88,-75.94] },
  { name: 'Roanoke', state: 'VA', box: [37.27,-79.95,37.30,-79.91] },
  { name: 'Charlottesville', state: 'VA', box: [38.03,-78.50,38.06,-78.46] },
  // Midwest fresh
  { name: 'Ann Arbor', state: 'MI', box: [42.27,-83.76,42.30,-83.72] },
  { name: 'Lansing', state: 'MI', box: [42.73,-84.57,42.76,-84.53] },
  { name: 'Kalamazoo', state: 'MI', box: [42.29,-85.60,42.32,-85.56] },
  { name: 'Flint', state: 'MI', box: [43.01,-83.70,43.04,-83.66] },
  { name: 'Toledo', state: 'OH', box: [41.66,-83.57,41.69,-83.53] },
  { name: 'Dayton', state: 'OH', box: [39.75,-84.21,39.78,-84.17] },
  { name: 'Springfield', state: 'OH', box: [39.92,-83.83,39.95,-83.79] },
  { name: 'Canton', state: 'OH', box: [40.79,-81.39,40.82,-81.35] },
  { name: 'Youngstown', state: 'OH', box: [41.09,-80.67,41.12,-80.63] },
  { name: 'Evansville', state: 'IN', box: [37.97,-87.58,38.00,-87.54] },
  { name: 'South Bend', state: 'IN', box: [41.67,-86.26,41.70,-86.22] },
  { name: 'Bloomington', state: 'IN', box: [39.16,-86.55,39.19,-86.51] },
  { name: 'Rockford', state: 'IL', box: [42.26,-89.09,42.29,-89.05] },
  { name: 'Springfield', state: 'IL', box: [39.79,-89.66,39.82,-89.62] },
  { name: 'Champaign', state: 'IL', box: [40.11,-88.25,40.14,-88.21] },
  { name: 'Decatur', state: 'IL', box: [39.84,-88.97,39.87,-88.93] },
  { name: 'Cedar Rapids', state: 'IA', box: [41.97,-91.69,42.00,-91.65] },
  { name: 'Davenport', state: 'IA', box: [41.52,-90.60,41.55,-90.56] },
  { name: 'Iowa City', state: 'IA', box: [41.65,-91.55,41.68,-91.51] },
  { name: 'Sioux City', state: 'IA', box: [42.49,-96.41,42.52,-96.37] },
  { name: 'Fargo', state: 'ND', box: [46.87,-96.82,46.90,-96.78] },
  { name: 'Sioux Falls', state: 'SD', box: [43.54,-96.74,43.57,-96.70] },
  { name: 'Rapid City', state: 'SD', box: [44.07,-103.24,44.10,-103.20] },
  { name: 'Billings', state: 'MT', box: [45.77,-108.54,45.80,-108.50] },
  { name: 'Missoula', state: 'MT', box: [46.86,-114.03,46.89,-113.99] },
  { name: 'Bozeman', state: 'MT', box: [45.67,-111.06,45.70,-111.02] },
  { name: 'Cheyenne', state: 'WY', box: [41.13,-104.84,41.16,-104.80] },
  { name: 'Casper', state: 'WY', box: [42.85,-106.33,42.88,-106.29] },
  { name: 'Idaho Falls', state: 'ID', box: [43.49,-112.06,43.52,-112.02] },
  // Northeast fresh
  { name: 'Buffalo', state: 'NY', box: [42.88,-78.88,42.91,-78.84] },
  { name: 'Albany', state: 'NY', box: [42.65,-73.77,42.68,-73.73] },
  { name: 'Syracuse', state: 'NY', box: [43.04,-76.16,43.07,-76.12] },
  { name: 'Ithaca', state: 'NY', box: [42.43,-76.51,42.46,-76.47] },
  { name: 'Saratoga Springs', state: 'NY', box: [43.08,-73.79,43.11,-73.75] },
  { name: 'Hartford', state: 'CT', box: [41.76,-72.70,41.79,-72.66] },
  { name: 'New Haven', state: 'CT', box: [41.30,-72.93,41.33,-72.89] },
  { name: 'Stamford', state: 'CT', box: [41.05,-73.56,41.08,-73.52] },
  { name: 'New London', state: 'CT', box: [41.35,-72.11,41.38,-72.07] },
  { name: 'Springfield', state: 'MA', box: [42.10,-72.60,42.13,-72.56] },
  { name: 'Northampton', state: 'MA', box: [42.32,-72.64,42.35,-72.60] },
  { name: 'Portsmouth', state: 'NH', box: [43.07,-70.77,43.10,-70.73] },
  { name: 'Portland', state: 'ME', box: [43.65,-70.28,43.68,-70.24] },
  { name: 'Burlington', state: 'VT', box: [44.47,-73.22,44.50,-73.18] },
  { name: 'Jersey City', state: 'NJ', box: [40.71,-74.08,40.74,-74.04] },
  { name: 'Newark', state: 'NJ', box: [40.73,-74.18,40.76,-74.14] },
  { name: 'Wilmington', state: 'DE', box: [39.74,-75.56,39.77,-75.52] },
  { name: 'Allentown', state: 'PA', box: [40.60,-75.49,40.63,-75.45] },
  { name: 'Erie', state: 'PA', box: [42.12,-80.10,42.15,-80.06] },
  { name: 'Lancaster', state: 'PA', box: [40.03,-76.32,40.06,-76.28] },
  { name: 'Harrisburg', state: 'PA', box: [40.26,-76.90,40.29,-76.86] },
  { name: 'Scranton', state: 'PA', box: [41.40,-75.67,41.43,-75.63] },
  { name: 'State College', state: 'PA', box: [40.79,-77.87,40.82,-77.83] },
  // Great Plains
  { name: 'Topeka', state: 'KS', box: [39.05,-95.70,39.08,-95.66] },
  { name: 'Lawrence', state: 'KS', box: [38.97,-95.25,39.00,-95.21] },
  { name: 'Lincoln', state: 'NE', box: [40.80,-96.71,40.83,-96.67] },
  { name: 'Bowling Green', state: 'KY', box: [36.98,-86.46,37.01,-86.42] },
  { name: 'Covington', state: 'KY', box: [39.08,-84.52,39.11,-84.48] },
  // Canadian fresh
  { name: 'Quebec City', state: 'QC', box: [46.81,-71.22,46.84,-71.18] },
  { name: 'Hamilton', state: 'ON', box: [43.25,-79.88,43.28,-79.84] },
  { name: 'London', state: 'ON', box: [42.98,-81.26,43.01,-81.22] },
  { name: 'Kitchener', state: 'ON', box: [43.44,-80.50,43.47,-80.46] },
  { name: 'Kelowna', state: 'BC', box: [49.88,-119.50,49.91,-119.46] },
  { name: 'Abbotsford', state: 'BC', box: [49.05,-122.33,49.08,-122.29] },
  { name: 'Lethbridge', state: 'AB', box: [49.69,-112.84,49.72,-112.80] },
  { name: 'Red Deer', state: 'AB', box: [52.26,-113.82,52.29,-113.78] },
  { name: 'Regina', state: 'SK', box: [50.44,-104.62,50.47,-104.58] },
  { name: 'Thunder Bay', state: 'ON', box: [48.38,-89.27,48.41,-89.23] },
  { name: 'St. John\'s', state: 'NL', box: [47.56,-52.72,47.59,-52.68] },
  { name: 'Moncton', state: 'NB', box: [46.09,-64.80,46.12,-64.76] },
  { name: 'Fredericton', state: 'NB', box: [45.96,-66.65,45.99,-66.61] },
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
  console.log('OSM v10 -- all review-worthy business types, target 2000');
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
