/**
 * ReplyPilot Lead Finder
 * Searches Google Maps for local businesses that have unanswered reviews —
 * the exact pain point ReplyPilot solves.
 *
 * Usage:
 *   node scripts/find-leads.js --city="Chicago" --type="restaurant" --key="YOUR_KEY"
 *   node scripts/find-leads.js --city="Miami" --type="hotel" --key="YOUR_KEY" --max=100 --output=miami-hotels.csv
 *
 * Requirements:
 *   - Google Places API key with Places API enabled
 *   - No npm installs needed — uses Node.js built-ins only
 *
 * Output: CSV file with business name, phone, website, rating, unanswered review count
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg) => {
  const eq = arg.indexOf('=');
  if (eq === -1) return acc;
  const k = arg.slice(2, eq);
  acc[k] = arg.slice(eq + 1);
  return acc;
}, {});

const CITY       = args.city   || 'New York';
const TYPE       = args.type   || 'restaurant';
const API_KEY    = args.key    || process.env.GOOGLE_PLACES_API_KEY;
const OUTPUT     = args.output || `leads-${TYPE}-${CITY.replace(/\s+/g, '-')}.csv`;
const MAX        = parseInt(args.max || '60');

if (!API_KEY) {
  console.error('\n❌  Google Places API key required.');
  console.error('    Use --key=YOUR_KEY  or  export GOOGLE_PLACES_API_KEY=YOUR_KEY\n');
  console.error('    Get a key at: https://console.cloud.google.com → Enable "Places API"\n');
  process.exit(1);
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────
function post(url, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('Bad JSON: ' + buf.slice(0, 200))); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    https.get({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, headers: headers || {} }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('Bad JSON: ' + buf.slice(0, 200))); } });
    }).on('error', reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── API calls (Places API New) ────────────────────────────────────────────────
const PLACES_HEADERS = {
  'X-Goog-Api-Key': API_KEY,
  'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri,nextPageToken'
};

async function searchPlaces(query, pageToken) {
  const body = { textQuery: query, maxResultCount: 20 };
  if (pageToken) body.pageToken = pageToken;
  return post('https://places.googleapis.com/v1/places:searchText', PLACES_HEADERS, body);
}

async function getDetails(placeId) {
  const fields = 'displayName,rating,userRatingCount,reviews,websiteUri,nationalPhoneNumber,formattedAddress,googleMapsUri';
  return get(
    `https://places.googleapis.com/v1/places/${placeId}`,
    { 'X-Goog-Api-Key': API_KEY, 'X-Goog-FieldMask': fields }
  );
}

// ─── CSV helpers ───────────────────────────────────────────────────────────────
function csvCell(val) {
  return '"' + String(val ?? '').replace(/"/g, "'").replace(/\n/g, ' ') + '"';
}

function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [headers.join(','), ...rows.map(r => headers.map(h => csvCell(r[h])).join(','))].join('\n');
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍  Searching for "${TYPE}" businesses in "${CITY}" (max ${MAX})...\n`);

  // Step 1: collect place IDs via text search (paginates 20 at a time)
  const places = [];
  let pageToken = null;

  do {
    if (pageToken) await sleep(2200);
    const result = await searchPlaces(`${TYPE} in ${CITY}`, pageToken);

    if (result.error) {
      console.error('\n❌  API error:', result.error.message);
      process.exit(1);
    }

    places.push(...(result.places || []));
    pageToken = result.nextPageToken || null;
    process.stdout.write(`  Collected ${places.length} listings...\r`);
  } while (pageToken && places.length < MAX);

  console.log(`\n✅  Found ${places.length} listings. Analyzing reviews...\n`);

  // Step 2: for each place, fetch details and check for unanswered reviews
  const leads = [];

  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    const placeName = place.displayName?.text || '';
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${places.length}] ${placeName.slice(0, 40).padEnd(42)}`);

    try {
      await sleep(150);
      const info = await getDetails(place.id);
      const reviews = info.reviews || [];

      if (reviews.length === 0) {
        process.stdout.write('no reviews\n');
        continue;
      }

      const unanswered    = reviews.filter(r => !r.ownerResponse);
      const unansweredBad = unanswered.filter(r => r.rating <= 3);

      if (unanswered.length === 0) {
        process.stdout.write('all answered ✓\n');
        continue;
      }

      const sampleReview = unanswered.sort((a, b) => a.rating - b.rating)[0];

      leads.push({
        business_name:           info.displayName?.text || placeName,
        address:                 info.formattedAddress || '',
        phone:                   info.nationalPhoneNumber || '',
        website:                 info.websiteUri || '',
        google_maps_url:         info.googleMapsUri || '',
        rating:                  info.rating ?? '',
        total_reviews:           info.userRatingCount || 0,
        reviews_sampled:         reviews.length,
        unanswered_count:        unanswered.length,
        unanswered_low_rating:   unansweredBad.length,
        worst_unanswered_stars:  unanswered.length ? Math.min(...unanswered.map(r => r.rating)) : '',
        sample_reviewer:         sampleReview?.authorAttribution?.displayName || '',
        sample_review_stars:     sampleReview?.rating || '',
        sample_review_snippet:   (sampleReview?.originalText?.text || sampleReview?.text?.text || '').slice(0, 120),
        email:                   '',
        email_sent:              '',
        replied:                 '',
        notes:                   ''
      });

      process.stdout.write(`${unanswered.length} unanswered (${unansweredBad.length} negative)\n`);
    } catch (e) {
      process.stdout.write(`error: ${e.message}\n`);
    }
  }

  if (!leads.length) {
    console.log('\n⚠️  No leads found with unanswered reviews. Try a different city or type.\n');
    return;
  }

  // Sort: most unanswered negative reviews first (hottest leads)
  leads.sort((a, b) =>
    b.unanswered_low_rating - a.unanswered_low_rating ||
    b.unanswered_count - a.unanswered_count
  );

  const outputPath = path.resolve(OUTPUT);
  fs.writeFileSync(outputPath, toCSV(leads));

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`🎯  ${leads.length} leads with unanswered reviews`);
  console.log(`📄  Saved → ${outputPath}`);
  console.log(`${'─'.repeat(60)}\n`);
  console.log('Top 10 hottest leads:\n');
  leads.slice(0, 10).forEach((l, i) => {
    const stars = '⭐'.repeat(Math.round(l.rating || 0));
    console.log(`  ${String(i + 1).padStart(2)}. ${l.business_name}`);
    console.log(`      ${stars} ${l.rating} · ${l.total_reviews} reviews · ${l.unanswered_count} unanswered (${l.unanswered_low_rating} negative)`);
    if (l.phone)   console.log(`      📞 ${l.phone}`);
    if (l.website) console.log(`      🌐 ${l.website}`);
    console.log();
  });

  console.log(`Next step: node scripts/send-emails.js --csv="${OUTPUT}" --from="you@yourdomain.com"\n`);
}

main().catch(err => {
  console.error('\n❌  Fatal error:', err.message);
  process.exit(1);
});
